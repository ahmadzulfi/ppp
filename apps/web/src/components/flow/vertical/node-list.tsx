'use client'

import { memo, useMemo, useState } from 'react'
import type { Edge, Node } from '@xyflow/react'
import type { NodeData } from '@wa/core/flow'
import { cn } from '@/lib/utils'
import { NODE_REGISTRY } from './registry'
import { flowOrder, snippetOf } from './graph-view'

/**
 * Every node as a searchable list, in the order the flow runs. The way to
 * find one node among hundreds without panning around the canvas.
 */
export const NodeList = memo(function NodeList({
  nodes,
  edges,
  selectedId,
  issues,
  hidden,
  onPick,
}: {
  nodes: Node[]
  edges: Edge[]
  selectedId: string | null
  issues: ReadonlyMap<string, 'error' | 'warning'>
  hidden: ReadonlySet<string>
  onPick: (id: string) => void
}) {
  const [query, setQuery] = useState('')
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])
  const { connected, loose } = useMemo(() => flowOrder(nodes, edges), [nodes, edges])

  const q = query.trim().toLowerCase()
  const matches = (id: string) => {
    if (!q) return true
    const data = byId.get(id)!.data as unknown as NodeData
    return `${NODE_REGISTRY[data.kind]?.label ?? data.kind} ${snippetOf(data)}`.toLowerCase().includes(q)
  }

  const row = ({ id, depth }: { id: string; depth: number }) => {
    const data = byId.get(id)!.data as unknown as NodeData
    const issue = issues.get(id)
    return (
      <button
        key={id}
        onClick={() => onPick(id)}
        style={{ paddingLeft: q ? 8 : 8 + Math.min(depth, 6) * 8 }}
        className={cn(
          'flex w-full items-start gap-1.5 rounded-md py-1 pr-2 text-left hover:bg-muted',
          id === selectedId && 'bg-accent-bg',
        )}
      >
        <span className="mt-0.5 shrink-0 text-fg-muted">{NODE_REGISTRY[data.kind]?.icon}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1 text-[12px] text-fg">
            <span className="truncate">{NODE_REGISTRY[data.kind]?.label ?? data.kind}</span>
            {hidden.has(id) && (
              <span className="shrink-0 text-[10px] text-fg-muted" title="Tersembunyi di dalam cabang terlipat">
                (terlipat)
              </span>
            )}
            {issue && (
              <span className={cn('ml-auto shrink-0 font-semibold', issue === 'error' ? 'text-danger' : 'text-warn')}>
                !
              </span>
            )}
          </span>
          {snippetOf(data) && <span className="block truncate text-[11px] text-fg-muted">{snippetOf(data)}</span>}
        </span>
      </button>
    )
  }

  const shownConnected = connected.filter((r) => matches(r.id))
  const shownLoose = loose.filter((r) => matches(r.id))

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="p-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari node…"
          className="h-7 w-full rounded-md border bg-surface px-2 text-[12px] text-fg outline-none focus:border-accent"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-2">
        {shownConnected.map(row)}
        {shownLoose.length > 0 && (
          <>
            <div className="mt-2 px-2 pb-1 text-[10px] tracking-wide text-fg-muted uppercase">Tidak tersambung</div>
            {shownLoose.map(row)}
          </>
        )}
        {shownConnected.length + shownLoose.length === 0 && (
          <p className="px-2 py-1 text-[11px] text-fg-muted">Tidak ada node yang cocok.</p>
        )}
      </div>
    </div>
  )
})
