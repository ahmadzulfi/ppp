import type { Edge, Node } from '@xyflow/react'
import type { NodeData } from '@wa/core/flow'
import { spanningTree } from './layout'

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

/**
 * Nodes in the order the flow runs: depth first from each trigger, branches
 * in handle order. Whatever no trigger reaches comes after, separately.
 */
export function flowOrder(nodes: Node[], edges: Edge[]) {
  const { roots, children } = spanningTree(nodes, edges)
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const walk = (id: string, depth: number, into: { id: string; depth: number }[]) => {
    into.push({ id, depth })
    for (const c of children.get(id) ?? []) walk(c, depth + 1, into)
  }
  const connected: { id: string; depth: number }[] = []
  const loose: { id: string; depth: number }[] = []
  for (const r of roots) walk(r, 0, kindOf(byId.get(r)!) === 'trigger' ? connected : loose)
  return { connected, loose }
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
