import type { FastifyInstance } from 'fastify'
import websocket from '@fastify/websocket'
import {
  consumeRealtimeTicket,
  subscribeRealtime,
  toRealtimeSignal,
  type RealtimeEvent,
  type RealtimeIdentity,
} from '@wa/core/realtime'

/**
 * The dashboard's live channel: GET /ws, upgraded to a WebSocket.
 *
 * One-way by design. Browsers only listen; everything they do still goes
 * through the dashboard's server actions. The worker and the dashboard
 * publish signals on Redis (see @wa/core/realtime), and this forwards each
 * to the sockets of the organization it belongs to.
 *
 * It lives here because this is the one long-running HTTP service besides
 * Next.js, and it is already the public one. It stays out of the webhook
 * path: a slow browser can cost Meta's POSTs nothing.
 */

/** Just the parts of a `ws` socket the hub needs, so tests can hand it fakes. */
export interface HubSocket {
  readonly readyState: number
  send(data: string): void
  ping(): void
  close(code?: number, reason?: string): void
  terminate(): void
}

const OPEN = 1

/** Sent by the server when a socket has lived its full life; the browser reconnects at once. */
export const CLOSE_RENEW = 4001

interface Client {
  socket: HubSocket
  orgId: string
  /** Cleared by each heartbeat, set again by the pong that answers it. */
  alive: boolean
}

/** Who is connected, by organization. */
export class RealtimeHub {
  private readonly byOrg = new Map<string, Set<Client>>()

  get size() {
    let n = 0
    for (const clients of this.byOrg.values()) n += clients.size
    return n
  }

  add(orgId: string, socket: HubSocket) {
    const client: Client = { socket, orgId, alive: true }
    let clients = this.byOrg.get(orgId)
    if (!clients) this.byOrg.set(orgId, (clients = new Set()))
    clients.add(client)

    return {
      pong: () => {
        client.alive = true
      },
      remove: () => this.drop(client),
    }
  }

  private drop(client: Client) {
    const clients = this.byOrg.get(client.orgId)
    if (!clients) return
    clients.delete(client)
    if (clients.size === 0) this.byOrg.delete(client.orgId)
  }

  /** @returns how many sockets the event was written to */
  dispatch(event: RealtimeEvent): number {
    const clients = this.byOrg.get(event.orgId)
    if (!clients) return 0

    const data = JSON.stringify(toRealtimeSignal(event))
    let sent = 0
    for (const c of clients) {
      if (c.socket.readyState !== OPEN) continue
      try {
        c.socket.send(data)
        sent++
      } catch {
        // The close event that follows removes it.
      }
    }
    return sent
  }

  /**
   * Pings everyone and cuts whoever did not answer the previous round.
   *
   * A laptop that sleeps or a network that drops leaves no close frame, so
   * without this the socket would sit in the map for good. The pings also
   * count as traffic, which keeps nginx from closing an idle connection.
   */
  heartbeat() {
    for (const clients of this.byOrg.values()) {
      for (const c of clients) {
        if (!c.alive) {
          c.socket.terminate()
          this.drop(c)
          continue
        }
        c.alive = false
        try {
          c.socket.ping()
        } catch {
          // Same as in dispatch.
        }
      }
    }
  }
}

export interface RealtimeDeps {
  consumeTicket: (ticket: string) => Promise<RealtimeIdentity | null>
  subscribe: (onEvent: (event: RealtimeEvent) => void) => { close: () => Promise<void> }
  heartbeatMs: number
  /**
   * How long one socket may live. The ticket is the only time the session is
   * checked, so this is the longest a signed-out or deactivated user keeps
   * hearing that something changed.
   */
  maxLifetimeMs: number
}

const DEFAULTS: RealtimeDeps = {
  consumeTicket: consumeRealtimeTicket,
  subscribe: subscribeRealtime,
  heartbeatMs: 30_000,
  maxLifetimeMs: 60 * 60_000,
}

declare module 'fastify' {
  interface FastifyRequest {
    realtimeIdentity?: RealtimeIdentity
  }
}

export async function realtimeRoutes(app: FastifyInstance, overrides: Partial<RealtimeDeps> = {}) {
  const deps = { ...DEFAULTS, ...overrides }

  // Browsers have nothing to say here, so anything bigger than a stray frame
  // is refused before it is buffered.
  await app.register(websocket, { options: { maxPayload: 1024 } })

  const hub = new RealtimeHub()
  const subscription = deps.subscribe((event) => hub.dispatch(event))
  const heartbeat = setInterval(() => hub.heartbeat(), deps.heartbeatMs)
  heartbeat.unref()

  app.addHook('onClose', async () => {
    clearInterval(heartbeat)
    await subscription.close()
  })

  app.get(
    '/ws',
    {
      websocket: true,
      // Runs before the upgrade, so a bad ticket gets a plain 401 and never
      // becomes a socket. The ticket shows up in this request's log line, but
      // it is spent by the time the line is written.
      preValidation: async (req, reply) => {
        const { ticket } = req.query as { ticket?: unknown }
        let who: RealtimeIdentity | null
        try {
          who = typeof ticket === 'string' ? await deps.consumeTicket(ticket) : null
        } catch (err) {
          // Redis is down. Browsers retry on their own and poll meanwhile, so
          // one quiet line per attempt is enough - not a stack trace.
          req.log.warn({ err: err instanceof Error ? err.message : String(err) }, 'tiket realtime tidak bisa diperiksa')
          return reply.code(503).send()
        }
        if (!who) return reply.code(401).send()
        req.realtimeIdentity = who
      },
    },
    (socket, req) => {
      const who = req.realtimeIdentity!
      const client = hub.add(who.orgId, socket)
      const expiry = setTimeout(() => socket.close(CLOSE_RENEW, 'renew'), deps.maxLifetimeMs)
      expiry.unref()

      socket.on('pong', client.pong)
      socket.on('close', () => {
        clearTimeout(expiry)
        client.remove()
        req.log.debug({ userId: who.userId, clients: hub.size }, 'realtime terputus')
      })
      // An unclean disconnect is routine; the close event that follows cleans up.
      socket.on('error', () => {})

      req.log.debug({ userId: who.userId, clients: hub.size }, 'realtime tersambung')
      socket.send(JSON.stringify({ type: 'ready' }))
    },
  )
}
