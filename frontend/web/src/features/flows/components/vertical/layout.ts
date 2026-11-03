import type { Edge, Node } from '@xyflow/react'
import { handlesOf, type FlowNode } from '@wa/core/flow'

const GAP_X = 40
const GAP_Y = 70
const FALLBACK = { width: 260, height: 110 }

/**
 * Top-to-bottom tree layout.
 *
 * A flow is a graph, not a tree, so each node is laid out under the first
 * node that reaches it (breadth-first from the triggers); every other edge
 * into it is just drawn. Children sit left to right in the order of the
 * handles they hang from, so the "ya" branch of a condition stays left of
 * "tidak" and list rows keep their order - the reason this is hand-rolled
 * rather than dagre, which does not know handle order.
 */
export function layoutTopDown(nodes: Node[], edges: Edge[]): Map<string, { x: number; y: number }> {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const size = (id: string) => nodeSize(byId.get(id)!)
  const { roots, children } = spanningTree(nodes, edges)

  const widths = new Map<string, number>()
  const subtreeWidth = (id: string): number => {
    const cached = widths.get(id)
    if (cached !== undefined) return cached
    const kids = children.get(id) ?? []
    const kidsWidth = kids.reduce((sum, k) => sum + subtreeWidth(k), 0) + GAP_X * Math.max(0, kids.length - 1)
    const w = Math.max(size(id).width, kidsWidth)
    widths.set(id, w)
    return w
  }

  const positions = new Map<string, { x: number; y: number }>()
  const place = (id: string, left: number, top: number) => {
    const { width, height } = size(id)
    const total = subtreeWidth(id)
    positions.set(id, { x: left + (total - width) / 2, y: top })
    const kids = children.get(id) ?? []
    const kidsWidth = kids.reduce((sum, k) => sum + subtreeWidth(k), 0) + GAP_X * Math.max(0, kids.length - 1)
    let x = left + (total - kidsWidth) / 2
    for (const k of kids) {
      place(k, x, top + height + GAP_Y)
      x += subtreeWidth(k) + GAP_X
    }
  }

  let left = 0
  for (const r of roots) {
    place(r, left, 0)
    left += subtreeWidth(r) + GAP_X * 2
  }
  return positions
}

/**
 * Which node hangs under which: each node belongs to the first node that
 * reaches it, so a node reached from several places (a shared "Selesai") has
 * one parent, and an edge looping back up to the menu makes no child. These
 * are the children the canvas draws under a node.
 */
export function spanningTree(nodes: Node[], edges: Edge[]) {
  const byId = new Map(nodes.map((n) => [n.id, n]))

  const handleIndex = (n: Node, handle: string | null | undefined) => {
    const data = n.data as unknown as FlowNode['data']
    const ids = handlesOf({ id: n.id, type: data.kind, position: n.position, data }).map((h) => h.id)
    const i = ids.indexOf(handle ?? null)
    return i === -1 ? ids.length : i
  }

  const out = new Map<string, Edge[]>()
  for (const e of edges) {
    if (!byId.has(e.source) || !byId.has(e.target)) continue
    out.set(e.source, [...(out.get(e.source) ?? []), e])
  }
  for (const [id, list] of out) {
    const n = byId.get(id)!
    list.sort((a, b) => handleIndex(n, a.sourceHandle) - handleIndex(n, b.sourceHandle))
  }

  const children = new Map<string, string[]>()
  const claimed = new Set<string>()
  const roots: string[] = []

  const grow = (root: string) => {
    roots.push(root)
    claimed.add(root)
    const queue = [root]
    while (queue.length) {
      const id = queue.shift()!
      for (const e of out.get(id) ?? []) {
        if (claimed.has(e.target)) continue
        claimed.add(e.target)
        children.set(id, [...(children.get(id) ?? []), e.target])
        queue.push(e.target)
      }
    }
  }

  const byPosition = (a: Node, b: Node) => a.position.x - b.position.x || a.position.y - b.position.y
  const isTrigger = (n: Node) => (n.data as { kind?: string }).kind === 'trigger'
  for (const n of nodes.filter(isTrigger).sort(byPosition)) grow(n.id)
  // Whatever no trigger reaches still gets a tidy spot, to the right.
  for (const n of [...nodes].sort(byPosition)) if (!claimed.has(n.id)) grow(n.id)

  return { roots, children }
}

/**
 * A node's size: measured when it has been drawn, otherwise estimated the
 * way the card sizes itself (one 76 px slot per branch). Nodes off screen in
 * a big flow are never drawn, so layout and fitting rely on the estimate.
 */
export function nodeSize(n: Node) {
  if (n.measured?.width && n.measured.height) return { width: n.measured.width, height: n.measured.height }
  const data = n.data as unknown as FlowNode['data']
  const outputs = handlesOf({ id: n.id, type: data.kind, position: n.position, data })
  const multi = outputs.length > 0 && !(outputs.length === 1 && outputs[0]!.id === null)
  return {
    width: multi ? Math.max(FALLBACK.width, outputs.length * 76) : FALLBACK.width,
    height: FALLBACK.height + (multi ? 20 : 0),
  }
}

/** The box around every given node, for fitting the view to all of them. */
export function boundsOf(nodes: Node[]) {
  if (nodes.length === 0) return null
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const n of nodes) {
    const { width, height } = nodeSize(n)
    x0 = Math.min(x0, n.position.x)
    y0 = Math.min(y0, n.position.y)
    x1 = Math.max(x1, n.position.x + width)
    y1 = Math.max(y1, n.position.y + height)
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
}
