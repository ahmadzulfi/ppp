import type { Edge, Node } from '@xyflow/react'
import { handlesOf, type NodeData } from '@wa/core/flow'

const kindOf = (n: Node) => (n.data as { kind?: string }).kind

function outgoing(edges: Edge[]) {
  const out = new Map<string, string[]>()
  for (const e of edges) out.set(e.source, [...(out.get(e.source) ?? []), e.target])
  return out
}

function reach(from: Iterable<string>, out: Map<string, string[]>, stop?: Set<string>) {
  const seen = new Set<string>()
  const queue = [...from]
  while (queue.length) {
    const id = queue.shift()!
    if (stop?.has(id)) continue
    for (const t of out.get(id) ?? []) {
      if (seen.has(t)) continue
      seen.add(t)
      queue.push(t)
    }
  }
  return seen
}

/**
 * What folding hides. A flow is a graph, not a tree, so only nodes that can
 * be reached solely through a folded node disappear: a "Selesai" shared with
 * an open branch stays. Nested folds work the same way, and a loop back up
 * to the menu cannot hide the menu, because the menu is reached from the
 * trigger without passing the fold.
 */
export function foldedView(nodes: Node[], edges: Edge[], folded: ReadonlySet<string>) {
  const out = outgoing(edges)
  const live = new Set([...folded].filter((id) => nodes.some((n) => n.id === id)))
  if (live.size === 0) return { hidden: new Set<string>(), hiddenUnder: new Map<string, number>() }

  const incoming = new Set(edges.map((e) => e.target))
  const roots = nodes.filter((n) => kindOf(n) === 'trigger' || !incoming.has(n.id)).map((n) => n.id)
  const visible = new Set([...roots, ...reach(roots, out, live)])
  const behindFolds = reach(live, out)

  const hidden = new Set([...behindFolds].filter((id) => !visible.has(id)))
  const hiddenUnder = new Map<string, number>()
  for (const id of live) {
    hiddenUnder.set(id, [...reach([id], out)].filter((x) => hidden.has(x)).length)
  }
  return { hidden, hiddenUnder }
}

/** Folded nodes that sit above `id`, which must open for it to show. */
export function foldsCovering(id: string, edges: Edge[], folded: ReadonlySet<string>) {
  const out = outgoing(edges)
  return [...folded].filter((f) => f !== id && reach([f], out).has(id))
}

/** One line of what a node says or does, for lists and search. */
export function snippetOf(data: NodeData): string {
  const s = (() => {
    switch (data.kind) {
      case 'trigger':
        return data.match === 'keyword' || data.match === 'exact' || data.match === 'regex'
          ? data.values.filter(Boolean).join(', ')
          : ''
      case 'sendText':
      case 'sendButtons':
      case 'sendList':
        return data.body
      case 'sendMedia':
        return data.caption || data.value
      case 'sendTemplate':
        return data.templateName
      case 'waitReply':
        return `simpan ke {{${data.saveAs}}}`
      case 'condition':
        return `{{${data.variable}}} ${data.operator} ${data.value}`
      case 'setVariable':
        return `{{${data.name}}} = ${data.value}`
      case 'httpRequest':
        return data.url
      case 'askAi':
      case 'aiRoute':
        return `{{${data.question}}}`
      case 'delay':
        return `${data.seconds} detik`
      case 'tag':
        return data.tags.join(', ')
      case 'end':
        return data.reason ?? ''
      default:
        return ''
    }
  })()
  return s.replace(/\s+/g, ' ').trim()
}

/** One row of the node tree, before anything is collapsed. */
export type TreeItem =
  | {
      type: 'node'
      id: string
      /** Set when the node holds rows of its own: a trigger, or a node with several outputs. */
      key?: string
      children?: TreeItem[]
    }
  | { type: 'branch'; key: string; label: string; index: number; children: TreeItem[] }
  /** A node already shown under another branch, or a link back up the flow. */
  | { type: 'ref'; id: string; key: string }

/**
 * The flow as a folder tree for the node list. Steps that follow each other
 * sit side by side, like files in a folder; only a node with several outputs
 * opens a level, one sub-folder per output, in handle order.
 *
 * A flow is a graph, so a node reached a second time (a shared "Selesai", a
 * loop back to the menu) is shown once, where reading order meets it first,
 * and as a link everywhere else.
 */
export function flowTree(nodes: Node[], edges: Edge[]) {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const outputsOf = (n: Node) => {
    const data = n.data as unknown as NodeData
    return handlesOf({ id: n.id, type: data.kind, position: n.position, data })
  }
  const next = new Map<string, string>()
  for (const e of edges) {
    if (!byId.has(e.source) || !byId.has(e.target)) continue
    const k = `${e.source}\u0000${e.sourceHandle ?? ''}`
    if (!next.has(k)) next.set(k, e.target)
  }
  const after = (id: string, handle: string | null) => next.get(`${id}\u0000${handle ?? ''}`)

  const placed = new Set<string>()
  /** Folder keys above each node, outermost first. */
  const ancestors = new Map<string, string[]>()
  let refs = 0

  const sequence = (start: string | undefined, path: string[]): TreeItem[] => {
    const items: TreeItem[] = []
    let cur = start
    while (cur) {
      if (placed.has(cur)) {
        items.push({ type: 'ref', id: cur, key: `r:${refs++}` })
        break
      }
      placed.add(cur)
      ancestors.set(cur, path)
      const n = byId.get(cur)!
      const outputs = outputsOf(n)
      const multi = !(outputs.length === 1 && outputs[0]!.id === null) && outputs.length > 0
      if (!multi) {
        items.push({ type: 'node', id: cur })
        cur = outputs.length ? after(cur, null) : undefined
        continue
      }
      const key = `n:${cur}`
      const id = cur
      items.push({
        type: 'node',
        id,
        key,
        children: outputs.map((h, index) => {
          const bkey = `b:${id}:${h.id}`
          return {
            type: 'branch' as const,
            key: bkey,
            label: h.label,
            index,
            children: sequence(after(id, h.id), [...path, key, bkey]),
          }
        }),
      })
      break
    }
    return items
  }

  // A trigger is a folder of its own, holding the flow it starts.
  const root = (n: Node): TreeItem => {
    placed.add(n.id)
    ancestors.set(n.id, [])
    const key = `n:${n.id}`
    return { type: 'node', id: n.id, key, children: sequence(after(n.id, null), [key]) }
  }

  const byPosition = (a: Node, b: Node) => a.position.x - b.position.x || a.position.y - b.position.y
  const isTrigger = (n: Node) => kindOf(n) === 'trigger'
  const roots = nodes.filter(isTrigger).sort(byPosition).map(root)

  // Whatever no trigger reaches, from the heads of those loose chains first.
  const incoming = new Set(edges.map((e) => e.target))
  const rest = nodes.filter((n) => !placed.has(n.id)).sort(byPosition)
  const loose: TreeItem[] = []
  for (const n of [...rest.filter((n) => !incoming.has(n.id)), ...rest]) {
    if (!placed.has(n.id)) loose.push(...sequence(n.id, []))
  }

  return { roots, loose, ancestors }
}

/** Nodes placed under a tree item, for the count on a closed folder. */
export function countNodes(items: TreeItem[]): number {
  let n = 0
  for (const it of items) {
    if (it.type === 'node') n += 1 + (it.children ? countNodes(it.children) : 0)
    else if (it.type === 'branch') n += countNodes(it.children)
  }
  return n
}
