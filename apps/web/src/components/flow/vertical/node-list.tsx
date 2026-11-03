'use client'

import { memo, useEffect, useMemo, useRef, useState } from 'react'
import type { Edge, Node } from '@xyflow/react'
import type { NodeData } from '@wa/core/flow'
import { cn } from '@/lib/utils'
import { NODE_REGISTRY, NODE_TONE, shortLabel } from './registry'
import { countNodes, flowTree, snippetOf, type TreeItem } from './graph-view'

/** One visible line of the tree, after collapsing and filtering. */
type Row = { item: TreeItem; depth: number; parent: string | null }

/**
 * Every node as a folder tree, in the order the flow runs: a branching node
 * opens one sub-folder per output, steps in a row sit side by side. The way
 * to find one node among hundreds without panning around the canvas.
 *
 * Clicks follow a file explorer: the arrow only opens and closes, a name
 * only goes to its node (a branch's name to the first step in it), and a
 * double click on a name opens or closes too. Closing a folder here only
 * tidies the list; the canvas keeps its own folds.
 */
export const NodeList = memo(function NodeList({
  nodes,
  edges,
  selectedId,
  issues,
  hidden,
  storageKey,
  onPick,
  onNotice,
}: {
  nodes: Node[]
  edges: Edge[]
  selectedId: string | null
  issues: ReadonlyMap<string, 'error' | 'warning'>
  hidden: ReadonlySet<string>
  /** Where this flow's closed folders are remembered, in this browser. */
  storageKey: string
  onPick: (id: string) => void
  /** One line of feedback over the canvas, for a click that has nowhere to go. */
  onNotice: (message: string) => void
}) {
  const [query, setQuery] = useState('')
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])
  const tree = useMemo(() => flowTree(nodes, edges), [nodes, edges])

  // Folders start open; what is remembered is which ones were closed.
  const [closed, setClosed] = useState<Set<string>>(() => new Set())
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? '[]')
      if (Array.isArray(saved)) setClosed(new Set(saved.filter((x) => typeof x === 'string')))
    } catch {
      // Private window or blocked storage: everything open.
    }
  }, [storageKey])
  const updateClosed = (next: Set<string>) => {
    setClosed(next)
    try {
      localStorage.setItem(storageKey, JSON.stringify([...next]))
    } catch {
      // Not remembering a folder is harmless.
    }
  }
  const toggle = (key: string) => {
    const next = new Set(closed)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    updateClosed(next)
  }

  // Picking a node on the canvas opens the folders above it.
  useEffect(() => {
    if (!selectedId) return
    const above = tree.ancestors.get(selectedId) ?? []
    if (above.some((k) => closed.has(k))) updateClosed(new Set([...closed].filter((k) => !above.includes(k))))
    // Only on a new selection: closing a folder above it afterwards is allowed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, tree])

  const q = query.trim().toLowerCase()

  // While filtering, a folder shows when something inside it matches, and
  // every folder on the way is open regardless of what was closed.
  const holdsMatch = useMemo(() => {
    const matches = (id: string) => {
      const data = byId.get(id)!.data as unknown as NodeData
      return `${shortLabel(data.kind)} ${NODE_REGISTRY[data.kind]?.label ?? data.kind} ${snippetOf(data)}`
        .toLowerCase()
        .includes(q)
    }
    const seen = new Map<TreeItem, boolean>()
    const check = (it: TreeItem): boolean => {
      const known = seen.get(it)
      if (known !== undefined) return known
      const own = it.type === 'node' ? matches(it.id) : it.type === 'branch' ? it.label.toLowerCase().includes(q) : false
      const inside = it.type !== 'ref' && !!it.children?.some(check)
      seen.set(it, own || inside)
      return own || inside
    }
    return check
  }, [byId, q])

  const flatten = (items: TreeItem[], depth: number, parent: string | null, into: Row[]) => {
    for (const item of items) {
      if (q && !holdsMatch(item)) continue
      into.push({ item, depth, parent })
      if (item.type !== 'ref' && item.key && item.children && (q || !closed.has(item.key))) {
        flatten(item.children, depth + 1, item.key, into)
      }
    }
    return into
  }
  const rows = flatten(tree.roots, 0, null, [])
  const looseRows = flatten(tree.loose, 0, null, [])
  const all = [...rows, ...looseRows]

  const allFolders = useMemo(() => {
    const keys: string[] = []
    const walk = (items: TreeItem[]) => {
      for (const it of items) {
        if (it.type === 'ref' || !it.key) continue
        keys.push(it.key)
        if (it.children) walk(it.children)
      }
    }
    walk(tree.roots)
    walk(tree.loose)
    return keys
  }, [tree])

  const go = (item: TreeItem) => {
    if (item.type !== 'branch') return onPick(item.id)
    const first = item.children[0]
    if (first && first.type !== 'branch') onPick(first.id)
    else onNotice(`Cabang "${item.label || 'ini'}" belum tersambung ke langkah apa pun.`)
  }

  // Keyboard, as in a file tree: arrows move and open, Enter goes.
  const rowKey = (r: Row) => (r.item.type === 'node' ? `id:${r.item.id}` : r.item.key)
  const [focused, setFocused] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const focusRow = (k: string) => {
    setFocused(k)
    box.current?.querySelector<HTMLElement>(`[data-row="${CSS.escape(k)}"]`)?.focus()
  }
  const onKey = (e: React.KeyboardEvent) => {
    const i = all.findIndex((r) => rowKey(r) === focused)
    const r = all[i]
    if (!r) return
    const folder = r.item.type !== 'ref' && r.item.key ? r.item.key : null
    if (e.key === 'ArrowDown' && all[i + 1]) focusRow(rowKey(all[i + 1]!))
    else if (e.key === 'ArrowUp' && all[i - 1]) focusRow(rowKey(all[i - 1]!))
    else if (e.key === 'ArrowRight' && folder) {
      if (closed.has(folder) && !q) toggle(folder)
      else if (all[i + 1]?.parent === folder) focusRow(rowKey(all[i + 1]!))
    } else if (e.key === 'ArrowLeft') {
      if (folder && !closed.has(folder) && !q) toggle(folder)
      else if (r.parent) {
        const up = all.find((x) => x.item.type !== 'ref' && x.item.key === r.parent)
        if (up) focusRow(rowKey(up))
      }
    } else if (e.key === 'Enter') go(r.item)
    else return
    e.preventDefault()
  }

  // Bring the selected node's row into view once its folders are open.
  useEffect(() => {
    if (!selectedId) return
    box.current?.querySelector(`[data-row="${CSS.escape(`id:${selectedId}`)}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [selectedId, closed])

  const line = (r: Row, first: boolean) => {
    const { item, depth } = r
    const k = rowKey(r)
    const folderKey = item.type !== 'ref' && item.key ? item.key : null
    const open = !!folderKey && (!!q || !closed.has(folderKey))
    const common = {
      'data-row': k,
      role: 'treeitem',
      'aria-level': depth + 1,
      'aria-expanded': folderKey ? open : undefined,
      tabIndex: focused === k || (!focused && first) ? 0 : -1,
      onFocus: () => setFocused(k),
      onClick: () => go(item),
      onDoubleClick: () => folderKey && !q && toggle(folderKey),
    }
    // One 12 px column per level - narrow, because menus nest deep - with its
    // line under the chevron of the folder above; stretched through the
    // row's padding so lines join up.
    const guides = (
      <span aria-hidden className="-my-[5px] flex shrink-0 self-stretch">
        {Array.from({ length: depth }, (_, d) => (
          <span key={d} className="relative w-3">
            <span className="absolute inset-y-0 left-3 border-l" />
          </span>
        ))}
      </span>
    )
    const chevron = (
      <span
        aria-hidden
        onClick={(e) => {
          if (!folderKey || q) return
          e.stopPropagation()
          toggle(folderKey)
        }}
        // Swallows the double click too, so a fast open-close on the arrow
        // does not also count as a double click on the row.
        onDoubleClick={(e) => folderKey && e.stopPropagation()}
        title={folderKey && !q ? (open ? 'Tutup' : 'Buka') : undefined}
        className={cn(
          'relative mt-[1px] flex size-4 shrink-0 items-center justify-center rounded text-fg-muted',
          folderKey &&
            !q &&
            'cursor-default before:absolute before:-inset-x-1.5 before:-inset-y-[5px] before:content-[""] hover:bg-surface hover:text-fg',
        )}
      >
        {folderKey && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className={cn('transition-transform', open && 'rotate-90')}>
            <path d="m9 18 6-6-6-6" />
          </svg>
        )}
      </span>
    )

    if (item.type === 'branch') {
      return (
        <div
          key={k}
          {...common}
          title={item.children.length ? 'Klik untuk ke langkah pertama, klik dua kali untuk buka/tutup' : 'Cabang ini belum tersambung'}
          className="flex cursor-pointer select-none items-start gap-1 rounded-md border border-transparent py-1 pr-2 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-accent"
        >
          {guides}
          {chevron}
          <span className="mt-px flex size-4 shrink-0 items-center justify-center rounded-full bg-navy-800 text-[9px] font-semibold text-white">
            {item.index + 1}
          </span>
          <span className="min-w-0 flex-1 truncate pl-0.5 text-[12px] leading-[18px] font-medium text-fg">{item.label || 'Cabang'}</span>
          {!open && countNodes(item.children) > 0 && <span className="shrink-0 text-[10px] leading-[18px] text-fg-muted">{countNodes(item.children)} langkah</span>}
        </div>
      )
    }

    const data = byId.get(item.id)?.data as unknown as NodeData | undefined
    if (!data) return null

    if (item.type === 'ref') {
      return (
        <div
          key={k}
          {...common}
          title="Node ini sudah tampil di cabang lain. Klik untuk loncat ke sana."
          className="flex cursor-pointer select-none items-start gap-1 rounded-md border border-transparent py-1 pr-2 text-[12px] leading-[18px] text-fg-muted outline-none hover:bg-muted hover:text-fg focus-visible:ring-2 focus-visible:ring-accent"
        >
          {guides}
          <span className="w-4 shrink-0 text-center">↪</span>
          <span className="min-w-0 truncate">
            Ke: <span className="font-medium">{shortLabel(data.kind)}</span>
            {snippetOf(data) && ` · ${snippetOf(data)}`}
          </span>
        </div>
      )
    }

    const issue = issues.get(item.id)
    const selected = item.id === selectedId
    return (
      <div
        key={k}
        {...common}
        aria-selected={selected}
        title={NODE_REGISTRY[data.kind]?.label}
        className={cn(
          'flex cursor-pointer select-none items-start gap-1 rounded-md border py-1 pr-2 outline-none focus-visible:ring-2 focus-visible:ring-accent',
          selected ? 'border-brand/60 bg-brand-bg' : 'border-transparent hover:bg-muted',
        )}
      >
        {guides}
        {chevron}
        <span className={cn('mt-px flex size-[18px] shrink-0 items-center justify-center rounded [&_svg]:size-3', NODE_TONE[data.kind])}>
          {NODE_REGISTRY[data.kind]?.icon}
        </span>
        <span className="min-w-0 flex-1 pl-0.5">
          <span className="flex items-center gap-1 text-[13px] leading-[18px] font-medium text-fg">
            <span className="truncate">{shortLabel(data.kind)}</span>
            {hidden.has(item.id) && (
              <span className="shrink-0 text-[10px] font-normal text-fg-muted" title="Tersembunyi di dalam cabang terlipat di kanvas">
                (terlipat)
              </span>
            )}
            {folderKey && !open && item.children && countNodes(item.children) > 0 && (
              <span className="shrink-0 text-[10px] font-normal text-fg-muted">· {countNodes(item.children)} node</span>
            )}
            {issue && (
              <span className={cn('ml-auto shrink-0 font-semibold', issue === 'error' ? 'text-danger' : 'text-warn')}>!</span>
            )}
          </span>
          {snippetOf(data) && <span className="block truncate text-[12px] text-fg-muted">{snippetOf(data)}</span>}
        </span>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1.5 px-4 pt-1 pb-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Saring daftar…"
          aria-label="Saring daftar node"
          className="h-8 min-w-0 flex-1 rounded-lg border bg-surface px-2.5 text-[12px] text-fg outline-none focus:border-accent"
        />
        <button
          onClick={() => updateClosed(new Set())}
          disabled={closed.size === 0 || !!q}
          title="Buka semua folder"
          className="flex size-8 shrink-0 items-center justify-center rounded-lg border text-fg-muted hover:bg-muted hover:text-fg disabled:opacity-40"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m7 15 5 5 5-5M7 9l5-5 5 5" />
          </svg>
        </button>
        <button
          onClick={() => updateClosed(new Set(allFolders))}
          disabled={allFolders.length === 0 || !!q}
          title="Tutup semua folder"
          className="flex size-8 shrink-0 items-center justify-center rounded-lg border text-fg-muted hover:bg-muted hover:text-fg disabled:opacity-40"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m7 20 5-5 5 5M7 4l5 5 5-5" />
          </svg>
        </button>
      </div>
      <div ref={box} role="tree" aria-label="Node di alur ini" onKeyDown={onKey} className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-3 pb-2">
        {rows.map((r, i) => line(r, i === 0))}
        {looseRows.length > 0 && (
          <>
            <div className="mt-2 px-1 pb-1 text-[10px] tracking-wide text-fg-muted uppercase">Tidak tersambung</div>
            {looseRows.map((r, i) => line(r, rows.length === 0 && i === 0))}
          </>
        )}
        {all.length === 0 && <p className="px-1 py-1 text-[11px] text-fg-muted">Tidak ada node yang cocok.</p>}
      </div>
    </div>
  )
})
