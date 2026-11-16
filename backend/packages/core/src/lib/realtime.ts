import { randomBytes } from 'node:crypto'
import IORedis from 'ioredis'
import { z } from 'zod'
import { logger } from './logger.js'

const log = logger.child({ module: 'realtime' })

/**
 * Live updates for the dashboard.
 *
 * Whoever changes a conversation or a broadcast publishes a small signal on
 * Redis; the webhook service holds the browsers' WebSockets and forwards it to
 * everyone in that organization. A signal says *what changed*, never the
 * content: the browser answers by re-reading the page through the same
 * authorized queries it always used, so nothing here can leak a message.
 *
 * Kept out of the package barrel for the same reason as the queues: importing
 * it pulls in ioredis.
 */

export const REALTIME_CHANNEL = 'wa:realtime'

const eventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('conversation.updated'), orgId: z.string().min(1), conversationId: z.string().min(1) }),
  z.object({ type: z.literal('campaign.updated'), orgId: z.string().min(1), campaignId: z.string().min(1) }),
])

export type RealtimeEvent = z.infer<typeof eventSchema>

type OmitFromEach<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

/** What a browser receives: the event without the org it was routed by. */
export type RealtimeSignal = OmitFromEach<RealtimeEvent, 'orgId'>

export function toRealtimeSignal(event: RealtimeEvent): RealtimeSignal {
  const { orgId: _orgId, ...signal } = event
  return signal
}

export function parseRealtimeEvent(raw: string): RealtimeEvent | null {
  try {
    const parsed = eventSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

const redisUrl = () => process.env.REDIS_URL ?? 'redis://localhost:6381'

// On globalThis so Next's dev reloads reuse the socket instead of leaking one
// per edit - the same trick @wa/db uses for Prisma.
const globalForRealtime = globalThis as unknown as { waRealtimeRedis?: IORedis }

/**
 * Its own connection rather than the queues' one. That one retries forever,
 * as BullMQ requires; a publish from a server action must instead give up
 * quickly when Redis is down.
 */
function connection(): IORedis {
  if (!globalForRealtime.waRealtimeRedis) {
    const c = new IORedis(redisUrl(), { maxRetriesPerRequest: 2, connectionName: 'wa-realtime' })
    // Without a listener ioredis prints every reconnect attempt to stderr.
    c.on('error', (err) => log.debug({ err: err.message }, 'redis realtime bermasalah'))
    globalForRealtime.waRealtimeRedis = c
  }
  return globalForRealtime.waRealtimeRedis
}

/**
 * Announces a change. Returns at once and never throws: a live update is a
 * nicety, and Redis being slow or down must not fail - or even delay - the
 * send or the webhook that raised it. A lost signal costs nothing but time,
 * because the dashboard falls back to polling while it has no socket.
 */
export function publishRealtime(event: RealtimeEvent): void {
  try {
    connection()
      .publish(REALTIME_CHANNEL, JSON.stringify(event))
      .catch((err: Error) => log.warn({ type: event.type, err: err.message }, 'publish realtime gagal'))
  } catch (err) {
    log.warn({ type: event.type, err: err instanceof Error ? err.message : String(err) }, 'publish realtime gagal')
  }
}

/**
 * The signals one message change calls for: its conversation, and - when the
 * message belongs to a broadcast - that broadcast's report.
 */
export function publishMessageChange(orgId: string, message: { conversationId: string; sentBy: string | null }) {
  publishRealtime({ type: 'conversation.updated', orgId, conversationId: message.conversationId })
  if (message.sentBy?.startsWith('campaign:')) {
    publishRealtime({ type: 'campaign.updated', orgId, campaignId: message.sentBy.slice('campaign:'.length) })
  }
}

/**
 * Listens for signals on a connection of its own, since a Redis connection in
 * subscriber mode can do nothing else. ioredis re-subscribes after a
 * reconnect by itself.
 */
export function subscribeRealtime(onEvent: (event: RealtimeEvent) => void): { close: () => Promise<void> } {
  // No retry cap: the SUBSCRIBE has to wait out a Redis that is still booting.
  const sub = new IORedis(redisUrl(), { maxRetriesPerRequest: null, connectionName: 'wa-realtime-sub' })
  sub.on('error', (err) => log.debug({ err: err.message }, 'redis realtime (subscriber) bermasalah'))
  sub.on('message', (_channel, raw) => {
    const event = parseRealtimeEvent(raw)
    if (event) onEvent(event)
    else log.warn('event realtime tidak dikenal, diabaikan')
  })
  sub.subscribe(REALTIME_CHANNEL).catch((err: Error) => log.error({ err: err.message }, 'subscribe realtime gagal'))

  return {
    close: async () => {
      sub.disconnect()
    },
  }
}

// ---------- Tickets ----------

export interface RealtimeIdentity {
  userId: string
  orgId: string
}

const identitySchema = z.object({ userId: z.string().min(1), orgId: z.string().min(1) })

/** Long enough for a slow page to open its socket, too short to be worth stealing. */
export const REALTIME_TICKET_TTL_S = 30

const ticketKey = (ticket: string) => `wa:rt:ticket:${ticket}`

/**
 * A one-time pass for opening the WebSocket.
 *
 * The dashboard's session is a cookie on the Next.js app; the socket lives on
 * the webhook service, which cannot read it - and a browser cannot attach
 * headers to a WebSocket. So the dashboard, having checked the session,
 * leaves a ticket in Redis, and the socket is opened with it. It works once
 * and for half a minute, which is why it can ride in the URL.
 */
export async function issueRealtimeTicket(who: RealtimeIdentity): Promise<string> {
  const ticket = randomBytes(24).toString('base64url')
  await connection().set(ticketKey(ticket), JSON.stringify(who), 'EX', REALTIME_TICKET_TTL_S)
  return ticket
}

/** Redeems a ticket. GETDEL, so two sockets can never share one. */
export async function consumeRealtimeTicket(ticket: string): Promise<RealtimeIdentity | null> {
  if (!/^[A-Za-z0-9_-]{32}$/.test(ticket)) return null
  const raw = await connection().getdel(ticketKey(ticket))
  if (!raw) return null
  try {
    const parsed = identitySchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export async function closeRealtime() {
  const c = globalForRealtime.waRealtimeRedis
  if (!c) return
  globalForRealtime.waRealtimeRedis = undefined
  await c.quit().catch(() => c.disconnect())
}
