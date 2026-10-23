'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { NodeKind } from '@wa/core/flow'
import { cn } from '@/lib/utils'
import {
  IconCheckCircle,
  IconChevronDown,
  IconCopy,
  IconFit,
  IconGrid,
  IconMessage,
  IconPlus,
  IconRedo,
  IconUndo,
  IconTrash,
  IconTree,
  IconZoomIn,
  IconZoomOut,
} from '@/components/ui/icons'
import { NODE_REGISTRY } from './registry'

/** Why an action cannot run right now, or null when it can. */
export type Blocked = string | null

/** Below these widths the ribbon first shrinks its big buttons, then folds the add group. */
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
  const Big = compact ? SmallAsLarge : Large

  const moreBlocked = addBlocked(null)
  const openMore = (e: React.MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    onMore({ x: r.left + r.width / 2, y: r.bottom })
  }

  return (
    <div ref={ref} className="flex shrink-0 overflow-x-auto border-b bg-surface">
      <div className={cn('flex shrink-0 flex-col justify-center gap-1 border-r px-3', compact ? 'w-40' : 'w-52')}>
        <span className="text-[10px] tracking-wide text-fg-muted uppercase">Node terpilih</span>
        {selectedLabel && <span className="text-[13px] font-medium text-fg">{selectedLabel}</span>}
        <span className="line-clamp-3 text-[11px] leading-snug text-fg-muted">{selectedHint}</span>
      </div>

      <Group label="Tambah lanjutan">
        {collapsed ? (
          <SmallAsLarge
            icon={<IconPlus size={20} />}
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
          <div className="grid grid-flow-col grid-rows-3 gap-x-1">
            {pins.map((kind) => (
              <Small
                key={kind}
                icon={NODE_REGISTRY[kind]?.icon}
                label={NODE_REGISTRY[kind]?.label ?? kind}
                blocked={addBlocked(kind)}
                onClick={() => onAdd(kind)}
                onBlocked={onBlocked}
              />
            ))}
            <Small
              icon={<IconGrid />}
              label={
                <span className="flex items-center gap-0.5">
                  Lainnya <IconChevronDown size={12} />
                </span>
              }
              blocked={moreBlocked}
              onClick={openMore}
              onBlocked={onBlocked}
            />
          </div>
        )}
      </Group>

      <Group label="Edit">
        <div className="grid grid-flow-col grid-rows-2 gap-x-1">
          <Small icon={<IconCopy />} label="Duplikat" blocked={duplicateBlocked} onClick={onDuplicate} onBlocked={onBlocked} />
          <Small icon={<IconTrash />} label="Hapus" blocked={deleteBlocked} onClick={onDelete} onBlocked={onBlocked} />
          <Small
            icon={<IconUndo />}
            label="Urungkan"
            blocked={canUndo ? null : 'Belum ada yang bisa diurungkan.'}
            onClick={onUndo}
            onBlocked={onBlocked}
            title="Ctrl+Z"
          />
          <Small
            icon={<IconRedo />}
            label="Ulangi"
            blocked={canRedo ? null : 'Belum ada yang bisa diulangi.'}
            onClick={onRedo}
            onBlocked={onBlocked}
            title="Ctrl+Y"
          />
        </div>
      </Group>

      <Group label="Tampilan">
        <div className="flex items-center gap-1">
          <div className="flex flex-col">
            <Small icon={<IconZoomIn />} label="Perbesar" onClick={onZoomIn} />
            <Small icon={<IconZoomOut />} label="Perkecil" onClick={onZoomOut} />
          </div>
          <Big icon={<IconFit size={22} />} label="Pas layar" onClick={onFit} />
        </div>
      </Group>

      <Group label="Tata letak">
        <div className={cn('flex gap-2', compact ? 'flex-col items-start' : 'items-center')}>
          <Big icon={<IconTree size={22} />} label="Rapikan" onClick={onTidy} />
          <label
            className="flex cursor-pointer items-center gap-1.5 self-start px-1.5 pt-1 text-[12px] text-fg"
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
        </div>
      </Group>

      <Group label="Periksa">
        <div className={cn('flex gap-1', compact && 'flex-col')}>
          <Big
            icon={<IconCheckCircle size={22} />}
            label={
              issueCount.errors > 0
                ? `${issueCount.errors} error`
                : issueCount.warnings > 0
                  ? `${issueCount.warnings} peringatan`
                  : 'Validasi'
            }
            tone={issueCount.errors > 0 ? 'danger' : issueCount.warnings > 0 ? 'warn' : undefined}
            onClick={onValidate}
          />
          <Big icon={<IconMessage size={22} />} label="Simulator" active={simulatorOpen} onClick={onSimulator} />
        </div>
      </Group>

      <Group label="Draf">
        <div className="flex flex-col items-start gap-1">
          <span className={cn('max-w-44 text-[11px]', saveFailed ? 'text-danger' : 'text-fg-muted')}>{saveText}</span>
          {draftActions}
        </div>
      </Group>
    </div>
  )
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex shrink-0 flex-col border-r px-2 pt-2">
      <div className="flex min-h-[76px] flex-1 items-start">{children}</div>
      <div className="pt-1 pb-1.5 text-center text-[10px] whitespace-nowrap text-fg-muted">{label}</div>
    </div>
  )
}

/**
 * A blocked button stays clickable: it is dimmed, and clicking it says why,
 * rather than sitting there greyed out with no explanation.
 */
function Small({
  icon,
  label,
  blocked = null,
  title,
  onClick,
  onBlocked,
}: {
  icon: ReactNode
  label: ReactNode
  blocked?: Blocked
  title?: string
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void
  onBlocked?: (reason: string) => void
}) {
  return (
    <button
      aria-disabled={!!blocked}
      title={blocked ?? title}
      onClick={(e) => (blocked ? onBlocked?.(blocked) : onClick(e))}
      className={cn(
        'flex h-6 items-center gap-1.5 rounded-md px-1.5 text-[12px] whitespace-nowrap',
        blocked ? 'text-fg-muted opacity-50' : 'text-fg hover:bg-muted',
      )}
    >
      <span className="shrink-0">{icon}</span>
      {label}
    </button>
  )
}

type BigProps = {
  icon: ReactNode
  label: ReactNode
  tone?: 'danger' | 'warn'
  active?: boolean
  blocked?: Blocked
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void
  onBlocked?: (reason: string) => void
}

function Large({ icon, label, tone, active, blocked = null, onClick, onBlocked }: BigProps) {
  return (
    <button
      aria-disabled={!!blocked}
      aria-pressed={active}
      title={blocked ?? undefined}
      onClick={(e) => (blocked ? onBlocked?.(blocked) : onClick(e))}
      className={cn(
        'flex h-16 min-w-14 flex-col items-center justify-center gap-1 rounded-md px-2 text-[12px] hover:bg-muted',
        tone === 'danger' ? 'text-danger' : tone === 'warn' ? 'text-warn' : 'text-fg',
        active && 'bg-accent-bg',
        blocked && 'opacity-50',
      )}
    >
      {icon}
      {label}
    </button>
  )
}

/** The narrow-screen form of a big button: same action, one row tall. */
function SmallAsLarge({ icon, label, tone, active, blocked = null, onClick, onBlocked }: BigProps) {
  return (
    <button
      aria-disabled={!!blocked}
      aria-pressed={active}
      title={blocked ?? undefined}
      onClick={(e) => (blocked ? onBlocked?.(blocked) : onClick(e))}
      className={cn(
        'flex h-6 items-center gap-1.5 rounded-md px-1.5 text-[12px] whitespace-nowrap hover:bg-muted [&_svg]:size-4',
        tone === 'danger' ? 'text-danger' : tone === 'warn' ? 'text-warn' : 'text-fg',
        active && 'bg-accent-bg',
        blocked && 'opacity-50',
      )}
    >
      {icon}
      {label}
    </button>
  )
}
