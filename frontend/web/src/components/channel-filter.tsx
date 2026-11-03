'use client'

import { cn } from '@/lib/utils'
import type { InboxFilter } from '@/lib/inbox-filter'
import { Menu } from '@/components/ui/menu'
import { LabelDot } from '@/components/labels/label-chip'

/**
 * Number and label filters, behind the icon above the list. The state lives
 * in the URL, so a filtered view survives opening a conversation and can be
 * linked to.
 */
export function ChannelFilter({
  channels,
  labels,
  filter,
  onChange,
}: {
  channels: { id: string; name: string }[]
  labels: { id: string; name: string; color: string }[]
  filter: InboxFilter
  onChange: (next: InboxFilter) => void
}) {
  const activeLabel = labels.find((l) => l.id === filter.labelId)
  const active = Boolean(filter.channelId || filter.labelId)

  return (
    <Menu
      label="Saring nomor dan label"
      triggerClassName={cn(
        'relative flex size-6 items-center justify-center rounded text-fg-muted hover:bg-muted hover:text-fg',
        active && 'text-accent',
      )}
      panelClassName="w-60 space-y-2 p-3"
      trigger={
        <>
          {/* arrow-down-wide-narrow, as in the design */}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m3 16 4 4 4-4M7 20V4M11 4h10M11 8h7M11 12h4" />
          </svg>
          {active && <span aria-hidden className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-brand" />}
        </>
      }
    >
      <label className="block">
        <span className="mb-1 block text-[11px] text-fg-muted">Nomor</span>
        <select
          value={filter.channelId ?? ''}
          onChange={(e) => onChange({ ...filter, channelId: e.target.value || null })}
          className="h-8 w-full rounded-md border bg-surface px-2 text-xs text-fg outline-none focus:border-accent"
        >
          <option value="">Semua ({channels.length})</option>
          {channels.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      {labels.length > 0 && (
        <label className="block">
          <span className="mb-1 flex items-center gap-1.5 text-[11px] text-fg-muted">
            Label
            {activeLabel && <LabelDot color={activeLabel.color} className="size-2" />}
          </span>
          <select
            value={filter.labelId ?? ''}
            onChange={(e) => onChange({ ...filter, labelId: e.target.value || null })}
            className="h-8 w-full rounded-md border bg-surface px-2 text-xs text-fg outline-none focus:border-accent"
          >
            <option value="">Semua label</option>
            {labels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {active && (
        <button
          type="button"
          onClick={() => onChange({ ...filter, channelId: null, labelId: null })}
          className="text-[11px] text-accent hover:underline"
        >
          Hapus saringan
        </button>
      )}
    </Menu>
  )
}
