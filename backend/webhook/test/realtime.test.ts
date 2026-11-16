import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import Fastify, { type FastifyInstance } from 'fastify'
import type { RealtimeEvent } from '@wa/core/realtime'
import { CLOSE_RENEW, RealtimeHub, realtimeRoutes, type HubSocket } from '../src/realtime.ts'

function fakeSocket(readyState = 1) {
  const s = {
    readyState,
    sent: [] as string[],
    pings: 0,
    terminated: false,
    send(data: string) {
      s.sent.push(data)
    },
    ping() {
      s.pings++
    },
    close() {},
    terminate() {
      s.terminated = true
    },
  }
  return s satisfies HubSocket
}

describe('RealtimeHub', () => {
  it('delivers an event only to sockets of its own organization, without the orgId', () => {
    const hub = new RealtimeHub()
    const a = fakeSocket()
    const b = fakeSocket()
    hub.add('org-a', a)
    hub.add('org-b', b)

    const sent = hub.dispatch({ type: 'conversation.updated', orgId: 'org-a', conversationId: 'c1' })

    assert.equal(sent, 1)
    assert.deepEqual(a.sent.map((m) => JSON.parse(m)), [{ type: 'conversation.updated', conversationId: 'c1' }])
    assert.deepEqual(b.sent, [])
  })

  it('skips a socket that is no longer open, and forgets one that was removed', () => {
    const hub = new RealtimeHub()
    const closing = fakeSocket(2)
    const gone = fakeSocket()
    hub.add('org-a', closing)
    hub.add('org-a', gone).remove()

    assert.equal(hub.dispatch({ type: 'campaign.updated', orgId: 'org-a', campaignId: 'k1' }), 0)
    assert.equal(hub.size, 1)
  })

  it('cuts a socket that did not answer the previous ping, and keeps one that did', () => {
    const hub = new RealtimeHub()
    const quiet = fakeSocket()
    const answering = fakeSocket()
    hub.add('org-a', quiet)
    const client = hub.add('org-a', answering)

    hub.heartbeat()
    client.pong()
    hub.heartbeat()

    assert.equal(quiet.terminated, true)
    assert.equal(answering.terminated, false)
    assert.equal(answering.pings, 2)
    assert.equal(hub.size, 1)
  })
})

describe('GET /ws', () => {
  let app: FastifyInstance
  let base: string
  let publish: (event: RealtimeEvent) => void = () => {}
  let subscriptionClosed = false

  const tickets = new Map([
    ['tiket-a', { userId: 'u1', orgId: 'org-a' }],
    ['tiket-a2', { userId: 'u2', orgId: 'org-a' }],
    ['tiket-b', { userId: 'u3', orgId: 'org-b' }],
    ['tiket-pendek', { userId: 'u4', orgId: 'org-a' }],
  ])

  before(async () => {
    app = Fastify()
    await app.register(realtimeRoutes, {
      // One use each, like the Redis GETDEL behind the real one.
      consumeTicket: async (ticket: string) => {
        const who = tickets.get(ticket) ?? null
        tickets.delete(ticket)
        return who
      },
      subscribe: (onEvent: (event: RealtimeEvent) => void) => {
        publish = onEvent
        return {
          close: async () => {
            subscriptionClosed = true
          },
        }
      },
      heartbeatMs: 60_000,
      maxLifetimeMs: 60_000,
    })
    await app.listen({ port: 0, host: '127.0.0.1' })
    const { port } = app.server.address() as { port: number }
    base = `ws://127.0.0.1:${port}/ws`
  })

  after(async () => {
    await app.close()
    assert.equal(subscriptionClosed, true, 'the Redis subscription must be closed with the server')
  })

  /** Opens a socket and resolves once the server's greeting has arrived. */
  function open(query: string) {
    const ws = new WebSocket(base + query)
    const messages: unknown[] = []
    const ready = new Promise<void>((resolve, reject) => {
      ws.addEventListener('message', (e) => {
        const m = JSON.parse(String(e.data))
        if (m.type === 'ready') resolve()
        else messages.push(m)
      })
      ws.addEventListener('close', (e) => reject(new Error(`ditutup sebelum siap (${e.code})`)))
    })
    return { ws, messages, ready }
  }

  const nextMessage = (ws: WebSocket) =>
    new Promise<unknown>((resolve) =>
      ws.addEventListener('message', (e) => resolve(JSON.parse(String(e.data))), { once: true }),
    )

  const closed = (ws: WebSocket) =>
    new Promise<CloseEvent>((resolve) => ws.addEventListener('close', resolve, { once: true }))

  it('refuses a connection with no ticket, or one nobody issued', async () => {
    for (const query of ['', '?ticket=ngarang']) {
      const ws = new WebSocket(base + query)
      let opened = false
      ws.addEventListener('open', () => (opened = true))
      await closed(ws)
      assert.equal(opened, false, `"${query}" tidak boleh tersambung`)
    }
  })

  it('refuses a ticket the second time it is used', async () => {
    const first = open('?ticket=tiket-a2')
    await first.ready

    const again = new WebSocket(base + '?ticket=tiket-a2')
    let opened = false
    again.addEventListener('open', () => (opened = true))
    await closed(again)
    assert.equal(opened, false)

    first.ws.close()
    await closed(first.ws)
  })

  it('forwards an event to the organization it belongs to and to no other', async () => {
    const a = open('?ticket=tiket-a')
    const b = open('?ticket=tiket-b')
    await Promise.all([a.ready, b.ready])

    const got = nextMessage(a.ws)
    publish({ type: 'conversation.updated', orgId: 'org-a', conversationId: 'c1' })
    assert.deepEqual(await got, { type: 'conversation.updated', conversationId: 'c1' })

    // Org B's turn, so there is something to wait for before looking at what B received.
    const gotB = nextMessage(b.ws)
    publish({ type: 'campaign.updated', orgId: 'org-b', campaignId: 'k9' })
    assert.deepEqual(await gotB, { type: 'campaign.updated', campaignId: 'k9' })
    assert.deepEqual(b.messages, [{ type: 'campaign.updated', campaignId: 'k9' }])
    assert.deepEqual(a.messages, [{ type: 'conversation.updated', conversationId: 'c1' }])

    a.ws.close()
    b.ws.close()
    await Promise.all([closed(a.ws), closed(b.ws)])
  })
})

describe('GET /ws without Redis', () => {
  it('answers 503, not a crash, when the ticket cannot be checked', async () => {
    const app = Fastify()
    await app.register(realtimeRoutes, {
      consumeTicket: async () => {
        throw new Error('redis mati')
      },
      subscribe: () => ({ close: async () => {} }),
    })

    const res = await app.inject({ method: 'GET', url: '/ws?ticket=apa-saja' })
    assert.equal(res.statusCode, 503)

    await app.close()
  })
})

describe('GET /ws lifetime', () => {
  it('closes a socket with the renew code once it has lived its full life', async () => {
    const app = Fastify()
    await app.register(realtimeRoutes, {
      consumeTicket: async () => ({ userId: 'u1', orgId: 'org-a' }),
      subscribe: () => ({ close: async () => {} }),
      heartbeatMs: 60_000,
      maxLifetimeMs: 50,
    })
    await app.listen({ port: 0, host: '127.0.0.1' })
    const { port } = app.server.address() as { port: number }

    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?ticket=apa-saja`)
    const e = await new Promise<CloseEvent>((resolve) => ws.addEventListener('close', resolve, { once: true }))
    assert.equal(e.code, CLOSE_RENEW)

    await app.close()
  })
})
