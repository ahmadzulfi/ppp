import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** Stands in for the browser's WebSocket; the test plays the server. */
class FakeSocket {
  static all: FakeSocket[] = []
  onopen: (() => void) | null = null
  onmessage: ((e: { data: unknown }) => void) | null = null
  onclose: ((e: { code: number }) => void) | null = null
  closedByClient = false
  url: string

  constructor(url: string) {
    this.url = url
    FakeSocket.all.push(this)
  }
  close() {
    this.closedByClient = true
  }
  serverOpen() {
    this.onopen?.()
  }
  serverSend(data: unknown) {
    this.onmessage?.({ data: typeof data === 'string' ? data : JSON.stringify(data) })
  }
  serverClose(code = 1006) {
    this.onclose?.({ code })
  }
}

let ticketCalls = 0
let ticketStatus = 200
let ticketUrl: string | null = 'ws://localhost:3001/ws'

async function load() {
  return import('./realtime')
}

/** Lets the timer that starts a connection fire, and the ticket fetch behind it settle. */
async function settle(ms = 0) {
  await vi.advanceTimersByTimeAsync(ms)
}

beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  FakeSocket.all = []
  ticketCalls = 0
  ticketStatus = 200
  ticketUrl = 'ws://localhost:3001/ws'
  vi.stubGlobal('WebSocket', FakeSocket)
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      ticketCalls++
      return new Response(JSON.stringify({ ticket: `tiket-${ticketCalls}`, url: ticketUrl }), { status: ticketStatus })
    }),
  )
  // Jitter off: retry delays become exactly half their cap.
  vi.spyOn(Math, 'random').mockReturnValue(0)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('socket realtime', () => {
  it('opens one socket with a ticket for the first listener, and reports resync once it is up', async () => {
    const rt = await load()
    const seen: unknown[] = []
    rt.onRealtime((s) => seen.push(s))
    rt.onRealtime(() => {})
    await settle()

    expect(FakeSocket.all).toHaveLength(1)
    expect(FakeSocket.all[0]!.url).toBe('ws://localhost:3001/ws?ticket=tiket-1')
    expect(rt.isRealtimeConnected()).toBe(false)

    FakeSocket.all[0]!.serverOpen()
    expect(rt.isRealtimeConnected()).toBe(true)
    expect(seen).toEqual([{ type: 'resync' }])
  })

  it('falls back to /ws on the page origin when the server names no URL', async () => {
    ticketUrl = null
    const rt = await load()
    rt.onRealtime(() => {})
    await settle()

    expect(FakeSocket.all[0]!.url).toBe(`ws://${location.host}/ws?ticket=tiket-1`)
  })

  it('passes on the signals it knows and ignores everything else', async () => {
    const rt = await load()
    const seen: unknown[] = []
    rt.onRealtime((s) => seen.push(s))
    await settle()
    const ws = FakeSocket.all[0]!
    ws.serverOpen()
    seen.length = 0

    ws.serverSend({ type: 'ready' })
    ws.serverSend({ type: 'conversation.updated', conversationId: 'c1', body: 'tidak boleh ikut' })
    ws.serverSend({ type: 'campaign.updated', campaignId: 'k1' })
    ws.serverSend({ type: 'conversation.updated' })
    ws.serverSend('bukan json')

    expect(seen).toEqual([
      { type: 'conversation.updated', conversationId: 'c1' },
      { type: 'campaign.updated', campaignId: 'k1' },
    ])
  })

  it('reconnects after a drop with a new ticket, waiting longer each time it fails', async () => {
    const rt = await load()
    const seen: unknown[] = []
    rt.onRealtime((s) => seen.push(s))
    await settle()
    FakeSocket.all[0]!.serverOpen()
    FakeSocket.all[0]!.serverClose()
    expect(rt.isRealtimeConnected()).toBe(false)

    await settle(499)
    expect(FakeSocket.all).toHaveLength(1)
    await settle(1)
    expect(FakeSocket.all).toHaveLength(2)
    expect(FakeSocket.all[1]!.url).toContain('ticket=tiket-2')

    // The handshake itself fails this time: the next wait is twice as long.
    FakeSocket.all[1]!.serverClose()
    await settle(999)
    expect(FakeSocket.all).toHaveLength(2)
    await settle(1)
    expect(FakeSocket.all).toHaveLength(3)

    FakeSocket.all[2]!.serverOpen()
    expect(seen).toEqual([{ type: 'resync' }, { type: 'resync' }])
  })

  it('reconnects at once when the server asks for a renewal', async () => {
    const rt = await load()
    rt.onRealtime(() => {})
    await settle()
    FakeSocket.all[0]!.serverOpen()
    FakeSocket.all[0]!.serverClose(4001)
    await settle()

    expect(FakeSocket.all).toHaveLength(2)
  })

  it('keeps trying while the ticket route is failing, but stops for good once signed out', async () => {
    ticketStatus = 503
    const rt = await load()
    rt.onRealtime(() => {})
    await settle()
    expect(ticketCalls).toBe(1)
    await settle(500)
    expect(ticketCalls).toBe(2)

    ticketStatus = 401
    await settle(1_000)
    expect(ticketCalls).toBe(3)
    await settle(120_000)
    expect(ticketCalls).toBe(3)
    expect(FakeSocket.all).toHaveLength(0)
  })

  it('closes the socket when the last listener leaves and does not come back', async () => {
    const rt = await load()
    const offA = rt.onRealtime(() => {})
    const offB = rt.onRealtime(() => {})
    await settle()
    const ws = FakeSocket.all[0]!
    ws.serverOpen()

    offA()
    expect(ws.closedByClient).toBe(false)
    offB()
    expect(ws.closedByClient).toBe(true)
    expect(rt.isRealtimeConnected()).toBe(false)

    ws.serverClose()
    await settle(60_000)
    expect(FakeSocket.all).toHaveLength(1)
  })

  it('opens a single socket when a listener mounts, unmounts and mounts again in one go', async () => {
    const rt = await load()
    rt.onRealtime(() => {})()
    rt.onRealtime(() => {})
    await settle()

    expect(ticketCalls).toBe(1)
    expect(FakeSocket.all).toHaveLength(1)
  })
})

describe('createRefreshThrottle', () => {
  function setVisible(visible: boolean) {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => (visible ? 'visible' : 'hidden'),
    })
    document.dispatchEvent(new Event('visibilitychange'))
  }

  beforeEach(() => {
    vi.setSystemTime(new Date('2026-11-13T00:00:00Z'))
    setVisible(true)
  })

  it('refreshes at once after a quiet spell, then folds what follows into one refresh a second later', async () => {
    const { createRefreshThrottle } = await load()
    const refresh = vi.fn()
    const t = createRefreshThrottle(refresh)

    t.request()
    expect(refresh).toHaveBeenCalledTimes(1)

    t.request()
    t.request()
    t.request()
    expect(refresh).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(999)
    expect(refresh).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    expect(refresh).toHaveBeenCalledTimes(2)
    t.dispose()
  })

  it('slows to the old polling pace under a signal stream that never pauses', async () => {
    const { createRefreshThrottle } = await load()
    const refresh = vi.fn()
    const t = createRefreshThrottle(refresh)

    // A broadcast: a signal every 100 ms for a minute.
    for (let i = 0; i < 600; i++) {
      t.request()
      vi.advanceTimersByTime(100)
    }
    // 8 quick ones at 1 s, the remaining ~52 s at one per 4 s.
    expect(refresh.mock.calls.length).toBeGreaterThanOrEqual(19)
    expect(refresh.mock.calls.length).toBeLessThanOrEqual(23)

    // A pause resets it: the next signal is immediate again.
    vi.advanceTimersByTime(10_000)
    const before = refresh.mock.calls.length
    t.request()
    expect(refresh).toHaveBeenCalledTimes(before + 1)
    t.dispose()
  })

  it('holds a refresh while the tab is hidden and runs it when the tab is shown', async () => {
    const { createRefreshThrottle } = await load()
    const refresh = vi.fn()
    const t = createRefreshThrottle(refresh)

    setVisible(false)
    t.request()
    t.request()
    vi.advanceTimersByTime(60_000)
    expect(refresh).not.toHaveBeenCalled()

    setVisible(true)
    expect(refresh).toHaveBeenCalledTimes(1)

    // Nothing owed any more: showing the tab again does not refresh by itself.
    setVisible(false)
    setVisible(true)
    expect(refresh).toHaveBeenCalledTimes(1)
    t.dispose()
  })
})
