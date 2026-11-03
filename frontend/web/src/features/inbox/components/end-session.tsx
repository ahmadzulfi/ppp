'use client'

import { useState, useTransition } from 'react'
import { endConversation, reopenConversation } from '@/features/inbox/api/messages-actions'
import { cn } from '@/utils/cn'

const pill =
  'flex h-6 shrink-0 items-center gap-1 rounded-full border px-2 text-[11px] text-fg-muted hover:bg-muted hover:text-fg disabled:opacity-50'

/**
 * Ends the conversation's session: it moves to Selesai and any running flow
 * stops. Asks once inline first - a flow halted mid-question cannot be put
 * back where it was.
 */
export function EndSession({ conversationId, closed }: { conversationId: string; closed: boolean }) {
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')
  const [pending, start] = useTransition()

  const run = (action: (id: string) => Promise<{ error?: string }>) =>
    start(async () => {
      setError('')
      const res = await action(conversationId)
      if (res.error) setError(res.error)
      setConfirming(false)
    })

  if (closed) {
    return (
      <button
        disabled={pending}
        onClick={() => run(reopenConversation)}
        title={error || 'Kembalikan ke tab Terbuka'}
        className={cn(pill, error && 'border-danger text-danger')}
      >
        {pending ? '…' : 'Buka lagi'}
      </button>
    )
  }

  if (confirming) {
    return (
      <span className="flex shrink-0 items-center gap-1 text-[11px]">
        <span className="text-fg-muted">Akhiri sesi?</span>
        <button
          disabled={pending}
          onClick={() => run(endConversation)}
          className="h-6 rounded-full bg-danger px-2 text-on-accent hover:opacity-90 disabled:opacity-50"
        >
          {pending ? '…' : 'Ya'}
        </button>
        <button disabled={pending} onClick={() => setConfirming(false)} className={pill}>
          Batal
        </button>
      </span>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      title={error || 'Pindahkan ke Selesai dan hentikan flow yang sedang berjalan'}
      className={cn(
        'flex h-[51px] shrink-0 items-center gap-2 rounded-md bg-navy-700 px-3 text-base font-medium text-white hover:bg-navy-800',
        error && 'bg-danger',
      )}
    >
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M20 6 9 17l-5-5" />
      </svg>
      Resolve
    </button>
  )
}
