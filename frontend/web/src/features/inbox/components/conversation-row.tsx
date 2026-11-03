'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { WindowBadge } from '@/features/inbox/components/window-badge'
import { LabelChip } from '@/components/label-chip'
import { ContactAvatar } from '@/components/contact-avatar'
import { cn } from '@/utils/cn'

/**
 * A client component purely so it can tell whether it is the open one.
 *
 * A layout does not receive its child route's dynamic params - `params.id` is
 * undefined in the inbox layout - so the active row has to read the pathname
 * itself rather than being told from above.
 */
export function ConversationRow({
  id,
  query,
  title,
  preview,
  time,
  channelName,
  windowExpiresAt,
  unreadCount,
  labels,
  handler,
  lastOutStatus,
}: {
  id: string
  /** The inbox filter, carried along so opening a row does not drop it. */
  query: string
  title: string
  preview: string
  time: string
  channelName: string
  windowExpiresAt: Date | null
  unreadCount: number
  labels: { id: string; name: string; color: string }[]
  handler: { agent: boolean; name: string }
  lastOutStatus: string | null
}) {
  const active = usePathname() === `/inbox/${id}`

  // markRead no longer refreshes the layout, so this row forgets its own
  // badge once opened. Remembering the count it cleared lets a fresh one
  // (new messages after a refresh) show again.
  const [clearedAt, setClearedAt] = useState<number | null>(null)
  useEffect(() => {
    if (active && unreadCount > 0) setClearedAt(unreadCount)
  }, [active, unreadCount])
  const showUnread = unreadCount > 0 && !active && clearedAt !== unreadCount

  return (
    <Link
      href={`/inbox/${id}${query}`}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex gap-2.5 border-b border-l-3 px-4 py-3.5 transition-colors',
        active ? 'border-l-accent bg-muted' : 'border-l-transparent bg-surface hover:bg-muted/60',
      )}
    >
      <ContactAvatar seed={id} name={title} />

      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <div className="flex items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-fg">{title}</span>
          <span className={cn('shrink-0 text-[10px]', active ? 'text-accent' : 'text-fg-muted')}>{time}</span>
        </div>

        <p className="truncate text-[11px] text-fg-muted">{preview}</p>

        <div className="flex min-w-0 items-center gap-1.5">
          <span
            className="flex min-w-0 items-center gap-1 text-[10px] text-fg-muted"
            title={handler.agent ? 'Ditangani agen' : `Bot · ${channelName}`}
          >
            {handler.agent ? <IconUser /> : <IconBot />}
            <span className="truncate">{handler.name}</span>
          </span>
          <WindowBadge expiresAt={windowExpiresAt} className="shrink-0 px-1 text-[9px] leading-3.5" />
          <span className="ml-auto shrink-0">
            {showUnread ? (
              <span className="flex h-[19px] min-w-[19px] items-center justify-center rounded-full bg-accent px-1 text-[9px] font-medium text-on-accent">
                {unreadCount}
              </span>
            ) : lastOutStatus === 'READ' || lastOutStatus === 'DELIVERED' ? (
              <IconCheckCheck className={lastOutStatus === 'READ' ? 'text-accent' : 'text-fg-muted'} />
            ) : null}
          </span>
        </div>

        {labels.length > 0 && (
          // Two fit the column next to each other; the rest is a count.
          <div className="mt-0.5 flex min-w-0 items-center gap-1">
            {labels.slice(0, 2).map((l) => (
              <LabelChip key={l.id} name={l.name} color={l.color} small className="max-w-28" />
            ))}
            {labels.length > 2 && (
              <span
                className="shrink-0 text-[10px] text-fg-muted"
                title={labels
                  .slice(2)
                  .map((l) => l.name)
                  .join(', ')}
              >
                +{labels.length - 2}
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  )
}

const small = {
  width: 11,
  height: 11,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

function IconBot() {
  return (
    <svg {...small} className="shrink-0">
      <path d="M12 8V4H8" />
      <rect x="4" y="8" width="16" height="12" rx="2" />
      <path d="M2 14h2M20 14h2M15 13v2M9 13v2" />
    </svg>
  )
}

function IconUser() {
  return (
    <svg {...small} className="shrink-0">
      <circle cx="12" cy="8" r="5" />
      <path d="M20 21a8 8 0 0 0-16 0" />
    </svg>
  )
}

export function IconCheckCheck({ className }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d="M18 6 7 17l-5-5M22 10l-7.5 7.5L13 16" />
    </svg>
  )
}
