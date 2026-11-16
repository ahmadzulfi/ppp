import type { RealtimeSignal } from '@wa/core/realtime'

/**
 * The browser's end of the live-update socket.
 *
 * One socket per tab, shared by whatever is on screen: it opens when the first
 * listener arrives and closes when the last one leaves. Everything it carries
 * is a hint that something changed - listeners answer by re-reading the page -
 * so a dropped connection loses nothing that the next read does not recover.
 */

/** `resync` is local: the socket just (re)opened, so anything may have been missed. */
export type Signal = RealtimeSignal | { type: 'resync' }

type Listener = (signal: Signal) => void

/** Must match CLOSE_RENEW in backend/webhook/src/realtime.ts. */
const CLOSE_RENEW = 4001

const RETRY_MIN_MS = 1_000
const RETRY_MAX_MS = 30_000

const listeners = new Set<Listener>()
const statusListeners = new Set<() => void>()

let connected = false
let socket: WebSocket | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null
let failures = 0
/** Bumped by every stop, so work started before it knows to walk away. */
let generation = 0

function setConnected(next: boolean) {
  if (connected === next) return
  connected = next
  for (const l of [...statusListeners]) l()
}

function emit(signal: Signal) {
  for (const l of [...listeners]) l(signal)
}

/** Doubles up to half a minute, with jitter so a restarted server is not hit by every tab at once. */
function retryDelay() {
  const cap = Math.min(RETRY_MAX_MS, RETRY_MIN_MS * 2 ** failures)
  failures++
  return cap / 2 + (Math.random() * cap) / 2
}

function scheduleConnect(delay: number) {
  if (retryTimer) clearTimeout(retryTimer)
  const run = generation
  retryTimer = setTimeout(() => {
    retryTimer = null
    if (run === generation) void connect()
  }, delay)
}

function sameOriginUrl() {
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`
}

function parseSignal(data: unknown): RealtimeSignal | null {
  if (typeof data !== 'string') return null
  try {
    const m = JSON.parse(data) as Record<string, unknown>
    if (m.type === 'conversation.updated' && typeof m.conversationId === 'string') {
      return { type: m.type, conversationId: m.conversationId }
    }
    if (m.type === 'campaign.updated' && typeof m.campaignId === 'string') {
      return { type: m.type, campaignId: m.campaignId }
    }
  } catch {
    // Not ours.
  }
  return null
}

async function connect() {
  const run = generation
  let ws: WebSocket
  try {
    // A fresh ticket every time: each one opens exactly one socket.
    const res = await fetch('/api/realtime/ticket', { method: 'POST' })
    if (run !== generation) return
    // Signed out. The next navigation lands on the login page; asking again helps nobody.
    if (res.status === 401) return
    if (!res.ok) throw new Error(`ticket ${res.status}`)
    const { ticket, url } = (await res.json()) as { ticket: string; url: string | null }
    if (run !== generation) return
    ws = new WebSocket(`${url ?? sameOriginUrl()}?ticket=${encodeURIComponent(ticket)}`)
  } catch {
    if (run === generation) scheduleConnect(retryDelay())
    return
  }

  socket = ws
  ws.onopen = () => {
    if (run !== generation) return
    failures = 0
    setConnected(true)
    // Also on the first open: the page was rendered a moment before the
    // socket existed, and a message may have landed in between.
    emit({ type: 'resync' })
  }
  ws.onmessage = (e) => {
    if (run !== generation) return
    const signal = parseSignal(e.data)
    if (signal) emit(signal)
  }
  // Fires for a failed handshake too, so this is the one place retries start.
  ws.onclose = (e) => {
    if (run !== generation) return
    socket = null
    setConnected(false)
    scheduleConnect(e.code === CLOSE_RENEW ? 0 : retryDelay())
  }
}

function stop() {
  generation++
  if (retryTimer) clearTimeout(retryTimer)
  retryTimer = null
  failures = 0
  const ws = socket
  socket = null
  ws?.close()
  setConnected(false)
}

/** @returns unsubscribe */
export function onRealtime(listener: Listener): () => void {
  listeners.add(listener)
  // Deferred, so React's mount-unmount-mount in development opens one socket, not two.
  if (listeners.size === 1) scheduleConnect(0)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) stop()
  }
}

/** For useSyncExternalStore. */
export function onRealtimeStatus(listener: () => void): () => void {
  statusListeners.add(listener)
  return () => statusListeners.delete(listener)
}

export const isRealtimeConnected = () => connected

const MIN_GAP_MS = 1_000
const BUSY_GAP_MS = 4_000
const BURST_LIMIT = 8
const QUIET_MS = 3_000

/**
 * Turns a stream of "something changed" into a sane number of page reads.
 *
 * The first signal after a quiet spell goes through at once - that is the
 * whole point of having a socket. Signals close behind it are folded into one
 * read a second later. If they keep coming without a pause (a broadcast going
 * out to thousands), the pace drops to the four seconds the dashboard polled
 * at before, so a busy day never costs the server more than it used to.
 *
 * Nothing is read while the tab is hidden; the request is remembered and
 * runs when the tab is looked at again.
 */
export function createRefreshThrottle(refresh: () => void) {
  let last = 0
  let burst = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  let owed = false

  const run = () => {
    timer = null
    last = Date.now()
    refresh()
  }

  const request = () => {
    if (document.visibilityState !== 'visible') {
      owed = true
      return
    }
    if (timer) return
    const now = Date.now()
    if (now - last > QUIET_MS) burst = 0
    burst++
    const wait = last + (burst > BURST_LIMIT ? BUSY_GAP_MS : MIN_GAP_MS) - now
    if (wait <= 0) run()
    else timer = setTimeout(run, wait)
  }

  const onVisibility = () => {
    if (document.visibilityState !== 'visible' || !owed) return
    owed = false
    request()
  }
  document.addEventListener('visibilitychange', onVisibility)

  return {
    request,
    dispose: () => {
      document.removeEventListener('visibilitychange', onVisibility)
      if (timer) clearTimeout(timer)
      timer = null
    },
  }
}
