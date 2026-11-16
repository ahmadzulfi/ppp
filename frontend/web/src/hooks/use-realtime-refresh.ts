'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import type { RealtimeSignal } from '@wa/core/realtime'
import { createRefreshThrottle, isRealtimeConnected, onRealtime, onRealtimeStatus } from '@/lib/realtime'

/**
 * Re-reads the current page (`router.refresh()`) when the server says
 * something it shows has changed.
 *
 * `match` picks the signals this page cares about. While the socket is down -
 * Redis restarting, a proxy that does not pass WebSockets, the laptop just
 * woke up - the page falls back to re-reading every `fallbackMs`, which is
 * how it worked before there was a socket. Pass null for a page that should
 * simply wait.
 */
export function useRealtimeRefresh({
  match,
  fallbackMs,
}: {
  match: (signal: RealtimeSignal) => boolean
  fallbackMs: number | null
}) {
  const router = useRouter()
  const connected = useSyncExternalStore(onRealtimeStatus, isRealtimeConnected, () => false)

  // `match` is usually an inline arrow; the subscription should not be torn
  // down and rebuilt on every render because of it.
  const matchRef = useRef(match)
  useEffect(() => {
    matchRef.current = match
  })

  const requestRef = useRef<() => void>(() => {})

  useEffect(() => {
    const throttle = createRefreshThrottle(() => router.refresh())
    requestRef.current = throttle.request
    const off = onRealtime((signal) => {
      if (signal.type === 'resync' || matchRef.current(signal)) throttle.request()
    })
    return () => {
      off()
      throttle.dispose()
      requestRef.current = () => {}
    }
  }, [router])

  useEffect(() => {
    if (connected || fallbackMs === null) return
    const t = setInterval(() => requestRef.current(), fallbackMs)
    return () => clearInterval(t)
  }, [connected, fallbackMs])
}
