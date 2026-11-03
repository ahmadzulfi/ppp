'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import type { Overview, Period } from '@/lib/dashboard'
import { cn } from '@/lib/utils'

/**
 * The top of the home page: messages by pricing category, the period
 * picker, six status tiles, and the number they were sent from.
 */
const num = new Intl.NumberFormat('id-ID')

const PERIOD_LABEL: Record<Period, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  week: 'Week',
  month: 'Month',
  year: 'Year',
}

export function DashboardOverview({
  period,
  periods,
  data,
  channel,
}: {
  period: Period
  periods: readonly Period[]
  data: Overview
  channel: { name: string; displayPhone: string | null } | null
}) {
  const pathname = usePathname()
  const params = useSearchParams()
  const href = (p: Period) => {
    const q = new URLSearchParams(params.toString())
    if (p === 'today') q.delete('period')
    else q.set('period', p)
    const s = q.toString()
    return s ? `${pathname}?${s}` : pathname
  }

  const { status, categories, mau } = data
  const digits = channel?.displayPhone?.replace(/\D/g, '') ?? ''
  const waLink = digits ? `https://wa.me/${digits}` : null

  return (
    <section className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-3 lg:flex-row lg:items-start">
        <div className="flex w-full shrink-0 flex-col gap-2 rounded-lg border bg-surface p-3.5 text-fg lg:w-auto lg:min-w-[180px]">
          <h2 className="font-bold whitespace-nowrap">Template Analytics</h2>
          <Stat label="Marketing" value={categories.marketing} />
          <Stat label="Utility" value={categories.utility} />
          {categories.authentication > 0 && <Stat label="Authentication" value={categories.authentication} />}
          <Stat label="Service" value={categories.service} />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <nav aria-label="Periode" className="flex w-fit max-w-full overflow-x-auto rounded-md border bg-surface">
            {periods.map((p) => (
              <Link
                key={p}
                href={href(p)}
                scroll={false}
                aria-current={p === period ? 'true' : undefined}
                className={cn(
                  'flex h-11 shrink-0 items-center gap-1.5 px-3 text-xs uppercase text-fg transition-colors',
                  p === period ? 'bg-muted font-bold' : 'font-medium hover:bg-muted/60',
                )}
              >
                <IconCalendar />
                {PERIOD_LABEL[p]}
              </Link>
            ))}
          </nav>

          <div className="grid gap-2.5 sm:grid-cols-3">
            <Tile tone="bg-tile-pending" value={status.pending} label="Pending" icon={<IconPending />} />
            <Tile tone="bg-tile-failed" value={status.failed} label="Failed" icon={<IconCross />} title="Ditolak Meta setelah diterima" />
            <Tile tone="bg-tile-failed" value={status.error} label="Error" icon={<IconCross />} title="Gagal sebelum sampai ke Meta" />
            <Tile tone="bg-tile-done" value={status.sent} label="Sent" icon={<IconCheck />} />
            <Tile tone="bg-tile-done" value={status.delivered} label="Delivered" icon={<IconDoubleCheck />} />
            <Tile tone="bg-tile-done" value={status.read} label="Read" icon={<IconDoubleCheck />} />
          </div>
        </div>
      </div>

      <aside className="flex w-full shrink-0 flex-col gap-3 xl:w-[280px]">
        <div className="flex flex-col gap-2.5 rounded-lg border bg-surface p-3.5">
          {channel ? (
            <>
              <div className="text-sm font-semibold text-accent">{channel.name}</div>
              {channel.displayPhone ? (
                <Copyable text={channel.displayPhone} className="text-[13px] font-bold text-fg" />
              ) : (
                <div className="text-[13px] text-fg-muted">Nomor belum terhubung</div>
              )}
              {waLink && <Copyable text={waLink} className="text-[11px] text-fg-muted" />}
            </>
          ) : (
            <Link href="/channels" className="text-sm text-accent hover:underline">
              Tambahkan nomor WhatsApp →
            </Link>
          )}
        </div>

        <div className="flex flex-col gap-2 rounded-lg border bg-surface p-3.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-semibold text-fg-muted">Monthly Active User (MAU)</span>
            <span className="text-xs font-semibold text-fg tabular-nums">{num.format(mau.active)}</span>
          </div>
          <div
            role="meter"
            aria-label="Kontak aktif bulan ini"
            aria-valuemin={0}
            aria-valuemax={mau.total}
            aria-valuenow={mau.active}
            className="h-2 overflow-hidden rounded bg-muted"
          >
            <div
              className="h-full min-w-1 rounded bg-tile-done"
              style={{ width: `${mau.total ? Math.min(100, (mau.active / mau.total) * 100) : 0}%` }}
            />
          </div>
          <span className="text-[11px] text-fg-muted">
            Kontak yang mengirim pesan bulan ini, dari {num.format(mau.total)} kontak.
          </span>
        </div>
      </aside>
    </section>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between gap-2">
      <span>{label}</span>
      <span className="tabular-nums">{num.format(value)}</span>
    </div>
  )
}

function Tile({ tone, value, label, icon, title }: { tone: string; value: number; label: string; icon: React.ReactNode; title?: string }) {
  return (
    <div title={title} className={cn('relative flex h-[103px] flex-col gap-1.5 overflow-hidden rounded-lg px-3 pt-3.5 pb-3 text-white', tone)}>
      <span className="text-xl font-bold tabular-nums">{num.format(value)}</span>
      <span>{label}</span>
      <span className="absolute right-2.5 bottom-2.5 flex size-[30px] items-center justify-center">{icon}</span>
    </div>
  )
}

function Copyable({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <span className={cn('truncate', className)}>{text}</span>
      <button
        type="button"
        title={copied ? 'Tersalin' : 'Salin'}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          } catch {
            // Clipboard blocked: the text is still there to select by hand.
          }
        }}
        className="shrink-0 rounded p-0.5 text-accent hover:bg-muted"
      >
        {copied ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M20 6 9 17l-5-5" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1} aria-hidden>
            <rect x="3.5" y="0.5" width="10" height="9.3" />
          </svg>
        )}
        <span className="sr-only">Salin</span>
      </button>
    </div>
  )
}

// Status marks from the design, faint on their tile.
function IconCalendar() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" aria-hidden>
      <rect x="0.5" y="2.6" width="13" height="10.9" />
      <path d="M0.5 6.4h13M4.2 0.5v3M9.8 0.5v3" />
    </svg>
  )
}

function IconPending() {
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" fill="none" stroke="#FFCA29" strokeWidth={3} opacity={0.4} aria-hidden>
      <circle cx="15" cy="15" r="13.5" />
      <path d="M15 5.36V15l6.43 4.29" />
    </svg>
  )
}

function IconCross() {
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" fill="none" stroke="white" strokeWidth={3} opacity={0.13} aria-hidden>
      <circle cx="15" cy="15" r="13.5" />
      <path d="m9.64 9.64 10.72 10.72M20.36 9.64 9.64 20.36" />
    </svg>
  )
}

function IconCheck() {
  return (
    <svg width="32.5" height="33.6" viewBox="0 0 32.5109 33.5619" fill="none" stroke="white" strokeWidth={3} opacity={0.27} aria-hidden>
      <path d="M1.25545 14.9385L11.6401 30.8209L31.2555 0.820874" />
    </svg>
  )
}

function IconDoubleCheck() {
  return (
    <svg width="32.6" height="33.8" viewBox="0 0 32.6101 33.782" fill="none" stroke="white" strokeWidth={3} opacity={0.27} aria-hidden>
      <path d="M1.30503 16.6219L9.30503 30.7395L14.805 21.0336M14.805 21.0336L26.305 0.739519M14.805 21.0336L12.305 16.6219M14.805 21.0336L20.305 30.7395L31.305 11.3278" />
    </svg>
  )
}
