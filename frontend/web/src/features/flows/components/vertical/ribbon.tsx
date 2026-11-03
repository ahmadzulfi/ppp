'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { NodeKind } from '@wa/core/flow'
import { cn } from '@/utils/cn'
import {
  IconCheckCircle,
  IconChevronDown,
  IconCopy,
  IconFit,
  IconMessage,
  IconPlus,
  IconRedo,
  IconUndo,
  IconTrash,
  IconTree,
  IconZoomIn,
  IconZoomOut,
} from '@/components/ui/icons'
import { NODE_REGISTRY, shortLabel } from './registry'

/** Why an action cannot run right now, or null when it can. */
export type Blocked = string | null

/** Below these widths the ribbon first narrows the selection card, then folds the add group. */
const COMPACT_BELOW = 1280
const COLLAPSED_BELOW = 1024

export function Ribbon({
  selectedLabel,
  selectedHint,
  pins,
  addBlocked,
  onAdd,
  onMore,
  duplicateBlocked,
  onDuplicate,
  deleteBlocked,
  onDelete,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onZoomIn,
  onZoomOut,
  onFit,
  onTidy,
  autoLayout,
  onAutoLayout,
  onValidate,
  issueCount,
  simulatorOpen,
  onSimulator,
  saveText,
  saveFailed,
  draftActions,
  onBlocked,
}: {
  selectedLabel: string | null
  selectedHint: string
  /** Kinds pinned as their own buttons, in order. */
  pins: NodeKind[]
  addBlocked: (kind: NodeKind | null) => Blocked
  onAdd: (kind: NodeKind) => void
  onMore: (at: { x: number; y: number }) => void
  duplicateBlocked: Blocked
  onDuplicate: () => void
  deleteBlocked: Blocked
  onDelete: () => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  onFit: () => void
  onTidy: () => void
  autoLayout: boolean
  onAutoLayout: (on: boolean) => void
  onValidate: () => void
  issueCount: { errors: number; warnings: number }
  simulatorOpen: boolean
  onSimulator: () => void
  saveText: string
  saveFailed: boolean
  /** Buttons under the save status: what can be done with the draft. */
  draftActions: ReactNode
  /** Shows why a dimmed button does nothing. */
  onBlocked: (reason: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(1440)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const compact = width < COMPACT_BELOW
  const collapsed = width < COLLAPSED_BELOW

  const moreBlocked = addBlocked(null)
  const openMore = (e: React.MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    onMore({ x: r.left + r.width / 2, y: r.bottom })
  }

  return (
    <div ref={ref} className="flex h-[88px] shrink-0 overflow-x-auto overflow-y-hidden border-b bg-surface">
      <Group label="Seleksi">
        <div
          className={cn(
            'mx-2.5 flex h-[59px] flex-col justify-center overflow-hidden rounded-[10px] border px-3',
            selectedLabel ? 'border-brand/40 bg-brand-bg' : 'bg-muted',
            compact ? 'w-40' : 'w-[194px]',
          )}
          title={selectedHint}
        >
          <span className={cn('text-[10px] font-semibold uppercase', selectedLabel ? 'text-brand' : 'text-fg-muted')}>
            Node terpilih
          </span>
          <span
            className={cn(
              'line-clamp-2 text-[11px] leading-tight font-medium',
              selectedLabel ? 'text-fg' : 'text-fg-muted',
            )}
          >
            {selectedLabel ?? 'Belum ada node dipilih'}
          </span>
        </div>
      </Group>

      <Group label="Tambah node">
        {collapsed ? (
          <Big
            icon={<IconPlus />}
            label={
              <span className="flex items-center gap-0.5">
                Tambah <IconChevronDown size={12} />
              </span>
            }
            blocked={moreBlocked}
            onClick={openMore}
            onBlocked={onBlocked}
          />
        ) : (
          <>
            {pins.map((kind) => (
              <Big
                key={kind}
                icon={NODE_REGISTRY[kind]?.icon}
                label={shortLabel(kind)}
                title={NODE_REGISTRY[kind]?.label}
                tone={kind === 'trigger' ? 'ok' : undefined}
                blocked={addBlocked(kind)}
                onClick={() => onAdd(kind)}
                onBlocked={onBlocked}
              />
            ))}
            <Big
              icon={<IconChevronDown />}
              label="Lainnya"
              blocked={moreBlocked}
              onClick={openMore}
              onBlocked={onBlocked}
            />
          </>
        )}
      </Group>

      <Group label="Edit">
        <Big
          icon={<IconCopy />}
          label="Duplikat"
          blocked={duplicateBlocked}
          onClick={onDuplicate}
          onBlocked={onBlocked}
        />
        <Big icon={<IconTrash />} label="Hapus" blocked={deleteBlocked} onClick={onDelete} onBlocked={onBlocked} />
        <Big icon={<IconTree />} label="Rapikan" onClick={onTidy} />
        <Big
          icon={<IconUndo />}
          label="Urungkan"
          title="Ctrl+Z"
          blocked={canUndo ? null : 'Belum ada yang bisa diurungkan.'}
          onClick={onUndo}
          onBlocked={onBlocked}
        />
        <Big
          icon={<IconRedo />}
          label="Ulangi"
          title="Ctrl+Y"
          blocked={canRedo ? null : 'Belum ada yang bisa diulangi.'}
          onClick={onRedo}
          onBlocked={onBlocked}
        />
        <label
          className="flex h-[54px] cursor-pointer flex-col items-center justify-center gap-1.5 px-1.5 text-[11px] whitespace-nowrap text-fg"
          title="Susun ulang node dari atas ke bawah setiap ada node yang ditambah, disambung, atau dihapus"
        >
          <button
            role="switch"
            aria-checked={autoLayout}
            onClick={() => onAutoLayout(!autoLayout)}
            className={cn(
              'relative h-4 w-7 rounded-full transition-colors',
              autoLayout ? 'bg-accent' : 'bg-muted ring-1 ring-border',
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 size-3 rounded-full bg-surface shadow-xs transition-[left]',
                autoLayout ? 'left-3.5' : 'left-0.5',
              )}
            />
          </button>
          Otomatis
        </label>
      </Group>

      <Group label="Tampilan">
        <Big icon={<IconZoomOut />} label="Perkecil" onClick={onZoomOut} />
        <Big icon={<IconZoomIn />} label="Perbesar" onClick={onZoomIn} />
        <Big icon={<IconFit />} label="Pas layar" onClick={onFit} />
      </Group>

      <Group label="Periksa">
        <Big
          icon={<IconCheckCircle />}
          label={
            issueCount.errors > 0
              ? `${issueCount.errors} error`
              : issueCount.warnings > 0
                ? `${issueCount.warnings} peringatan`
                : 'Validasi'
          }
          strong
          tone={issueCount.errors > 0 ? 'danger' : issueCount.warnings > 0 ? 'warn' : undefined}
          onClick={onValidate}
        />
        <Big icon={<IconMessage />} label="Simulator" active={simulatorOpen} onClick={onSimulator} />
      </Group>

      <Group label="Draf" last>
        <div className="flex h-[54px] flex-col justify-center gap-1 px-1">
          <span className={cn('max-w-44 text-[11px] leading-tight', saveFailed ? 'text-danger' : 'text-fg-muted')}>
            {saveText}
          </span>
          {draftActions}
        </div>
      </Group>
    </div>
  )
}

function Group({ label, last, children }: { label: string; last?: boolean; children: ReactNode }) {
  return (
    <div className={cn('flex shrink-0 flex-col', !last && 'border-r')}>
      <div className="flex flex-1 items-start gap-1 px-2.5 pt-[7px]">{children}</div>
      <div className="pb-1.5 text-center text-[10px] whitespace-nowrap text-fg-muted">{label}</div>
    </div>
  )
}

/**
 * An icon over its label, as the design draws every ribbon action. A
 * blocked button stays clickable: it is dimmed, and clicking it says why,
 * rather than sitting there greyed out with no explanation.
 */
function Big({
  icon,
  label,
  title,
  tone,
  strong,
  active,
  blocked = null,
  onClick,
  onBlocked,
}: {
  icon: ReactNode
  label: ReactNode
  title?: string
  tone?: 'danger' | 'warn' | 'ok'
  strong?: boolean
  active?: boolean
  blocked?: Blocked
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void
  onBlocked?: (reason: string) => void
}) {
  return (
    <button
      aria-disabled={!!blocked}
      aria-pressed={active}
      title={blocked ?? title}
      onClick={(e) => (blocked ? onBlocked?.(blocked) : onClick(e))}
      className={cn(
        'flex h-[54px] min-w-10 flex-col items-center justify-center gap-1.5 rounded-md px-1.5 text-[11px] whitespace-nowrap hover:bg-muted [&_svg]:size-5',
        tone === 'danger' ? 'text-danger' : tone === 'warn' ? 'text-warn' : tone === 'ok' ? 'text-ok' : 'text-fg',
        strong && 'font-medium',
        active && 'bg-accent-bg',
        blocked && 'opacity-50',
      )}
    >
      {icon}
      {label}
    </button>
  )
}
