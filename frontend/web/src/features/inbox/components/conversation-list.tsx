'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { listConversations } from '@/features/inbox/api/inbox-actions'
import { filterFrom, isDefaultFilter, queryOf, type InboxFilter, type InboxRow, type InboxStatus } from '@/features/inbox/utils/inbox-filter'
import { ChannelFilter } from '@/features/inbox/components/channel-filter'
import { ConversationRow } from '@/features/inbox/components/conversation-row'
import { cn } from '@/utils/cn'

/**
 * The inbox's left column.
 *
 * The layout renders the unfiltered list; a filter in the URL is fetched from
 * here, because a layout is never given searchParams. A refresh hands down a
 * new `initial`, which is the cue to fetch the filtered rows again too.
 */
export function ConversationList({
  initial,
  channels,
  labels,
}: {
  initial: InboxRow[]
  channels: { id: string; name: string }[]
  labels: { id: string; name: string; color: string }[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const filter = filterFrom(useSearchParams())
  const query = queryOf(filter)
  const filtered = !isDefaultFilter(filter)

  const [fetched, setFetched] = useState<{ query: string; rows: InboxRow[] } | null>(null)
  useEffect(() => {
    if (!filtered) return
    let live = true
    listConversations(filter).then((rows) => live && setFetched({ query, rows }))
    return () => {
      live = false
    }
    // `filter` is rebuilt every render; `query` is its stable spelling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, initial])

  // Search and "Belum dibaca" narrow the rows already loaded; they are quick
  // looks, not views worth a URL.
  const [search, setSearch] = useState('')
  const [unreadOnly, setUnreadOnly] = useState(false)

  // A refetch of the same filter keeps its old rows up meanwhile; a new
  // filter shows "Memuat…" rather than rows that do not match it.
  const loaded = !filtered ? initial : fetched?.query === query ? fetched.rows : null
  const needle = search.trim().toLowerCase()
  const rows =
    loaded?.filter(
      (c) =>
        (!unreadOnly || c.unreadCount > 0) &&
        (!needle || c.title.toLowerCase().includes(needle) || c.preview.toLowerCase().includes(needle)),
    ) ?? null
  const unread = loaded?.filter((c) => c.unreadCount > 0).length ?? 0

  const change = (next: InboxFilter) => router.replace(`${pathname}${queryOf(next)}`, { scroll: false })
  const tab = (status: InboxStatus, unreadTab = false) => {
    setUnreadOnly(unreadTab)
    if (status !== filter.status) change({ ...filter, status })
  }

  const TABS: { key: string; label: string; active: boolean; onClick: () => void }[] = [
    { key: 'all', label: 'Semua', active: filter.status === 'open' && !unreadOnly, onClick: () => tab('open') },
    {
      key: 'unread',
      label: `Belum dibaca${unread ? ` ${unread}` : ''}`,
      active: filter.status === 'open' && unreadOnly,
      onClick: () => tab('open', true),
    },
    { key: 'mine', label: 'Saya', active: filter.status === 'mine', onClick: () => tab('mine') },
    { key: 'closed', label: 'Selesai', active: filter.status === 'closed', onClick: () => tab('closed') },
  ]

  return (
    <>
      <div className="shrink-0 px-[22px] pt-4">
        <h1 className="flex items-center gap-2 text-[22px] font-semibold text-fg">
          <span aria-hidden className="size-[7px] rounded-full bg-ok" />
          Inbox
        </h1>
        <label className="mt-4 flex h-10 items-center gap-2 rounded-md border bg-muted px-3 focus-within:border-accent">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden className="shrink-0 text-fg-muted">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari"
            aria-label="Cari percakapan"
            className="min-w-0 flex-1 bg-transparent text-[11px] text-fg outline-none placeholder:text-fg-muted"
          />
        </label>
      </div>

      <div role="tablist" aria-label="Percakapan" className="mt-5 flex h-[42px] shrink-0 gap-4 border-b px-5">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={t.active}
            onClick={t.onClick}
            className={cn(
              'flex h-full items-center border-b-3 text-[10px] whitespace-nowrap transition-colors',
              t.active ? 'border-accent font-semibold text-accent' : 'border-transparent text-fg-muted hover:text-fg',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex shrink-0 items-center justify-between px-6 py-1.5">
        <span className="text-[10px] tracking-wide text-fg-muted uppercase">
          {filter.status === 'closed' ? 'Percakapan selesai' : 'Percakapan terbaru'}
        </span>
        <ChannelFilter channels={channels} labels={labels} filter={filter} onChange={change} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto border-t">
        {rows === null && <p className="p-6 text-center text-xs text-fg-muted">Memuat…</p>}

        {rows?.length === 0 &&
          (needle || unreadOnly ? (
            <p className="p-6 text-center text-xs text-fg-muted">
              {needle ? `Tidak ada percakapan yang cocok dengan “${search.trim()}”.` : 'Semua percakapan sudah dibaca.'}
            </p>
          ) : filtered ? (
            <div className="p-6 text-center text-xs text-fg-muted">
              <p>Tidak ada percakapan yang cocok dengan saringan ini.</p>
              <button
                type="button"
                onClick={() => change({ channelId: null, labelId: null, status: 'open' })}
                className="mt-2 text-accent hover:underline"
              >
                Hapus saringan
              </button>
            </div>
          ) : (
            <p className="p-6 text-center text-xs text-fg-muted">
              Belum ada percakapan. Pesan masuk akan muncul di sini.
            </p>
          ))}

        {rows?.map((c) => (
          <ConversationRow
            key={c.id}
            id={c.id}
            query={query}
            title={c.title}
            preview={c.preview}
            time={c.time}
            channelName={c.channelName}
            windowExpiresAt={c.windowExpiresAt}
            unreadCount={c.unreadCount}
            labels={c.labels}
            handler={c.handler}
            lastOutStatus={c.lastOutStatus}
          />
        ))}
      </div>
    </>
  )
}
