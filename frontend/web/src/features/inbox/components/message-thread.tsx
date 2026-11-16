'use client'

import { useLayoutEffect, useRef, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

/** How close to the bottom still counts as "reading the latest". */
const STICK_PX = 120

/**
 * The scrolling message pane, read like WhatsApp: oldest at the top, opening
 * on the newest at the bottom.
 *
 * Inbound messages arrive through the webhook and worker; the conversation
 * list beside this pane listens for them and re-reads the page. A new last
 * message pulls the pane down only when the agent was already at the bottom;
 * someone scrolled up to read history is left where they are.
 *
 * Older history is a bigger `?tampil=` on the same page rather than rows held
 * here, so that re-read cannot drop what was loaded or leave a gap.
 */
export function MessageThread({
  shown,
  nextShown,
  firstMessageId,
  lastMessageId,
  children,
}: {
  shown: number
  /** The count "muat pesan sebelumnya" asks for; null when nothing is older. */
  nextShown: number | null
  firstMessageId: string | null
  lastMessageId: string | null
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const pane = useRef<HTMLDivElement>(null)
  const atBottom = useRef(true)
  // Distance from the bottom when older messages were asked for, so the
  // message being read stays put while rows are added above it.
  const keepFromBottom = useRef<number | null>(null)
  const [loading, startLoading] = useTransition()

  useLayoutEffect(() => {
    const el = pane.current
    if (el && atBottom.current) el.scrollTop = el.scrollHeight
  }, [lastMessageId])

  useLayoutEffect(() => {
    const el = pane.current
    if (!el || keepFromBottom.current === null) return
    el.scrollTop = el.scrollHeight - keepFromBottom.current
    keepFromBottom.current = null
  }, [firstMessageId, shown])

  const loadOlder = () => {
    const el = pane.current
    if (!el || nextShown === null) return
    keepFromBottom.current = el.scrollHeight - el.scrollTop
    const q = new URLSearchParams(searchParams)
    q.set('tampil', String(nextShown))
    startLoading(() => router.replace(`${pathname}?${q}`, { scroll: false }))
  }

  return (
    <div
      ref={pane}
      onScroll={(e) => {
        const el = e.currentTarget
        atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_PX
      }}
      className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-bg p-4"
    >
      {nextShown !== null && (
        <div className="flex justify-center pb-2">
          <button
            type="button"
            onClick={loadOlder}
            disabled={loading}
            className="rounded-full border bg-surface px-3 py-1 text-xs text-fg-muted hover:text-fg disabled:opacity-50"
          >
            {loading ? 'Memuat…' : 'Muat pesan sebelumnya'}
          </button>
        </div>
      )}
      {children}
    </div>
  )
}
