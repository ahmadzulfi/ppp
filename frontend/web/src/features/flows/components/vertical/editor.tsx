'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import {
  Background,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type FinalConnectionState,
  type Node,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { nanoid } from 'nanoid'
import {
  NODE_LABELS,
  assignedVariables,
  handlesOf,
  validateFlow,
  type FlowGraph,
  type NodeData,
  type NodeKind,
} from '@wa/core/flow'
import { IconChevronLeft, IconChevronRight, IconFit, IconPin, IconPlus, IconSearch } from '@/components/ui/icons'
import { publishFlow, saveDraft } from '@/features/flows/api/flows-actions'
import { Inspector } from '../inspector'
import { PALETTE, defaultData } from '../../utils/defaults'
import { cn } from '@/utils/cn'
import { TemplatesProvider, type TemplateOption } from '../templates-context'
import { AiEndpointsProvider, type AiEndpointOption } from '../ai-context'
import { AddFromHandleContext, CARD_WIDTH, DeleteNodeContext, ToggleFoldContext, VerticalNodeCard } from './node-card'
import { boundsOf, layoutTopDown, spanningTree } from './layout'
import { Ribbon, type Blocked } from './ribbon'
import { DEFAULT_PINS, MAX_PINS, NODE_REGISTRY, shortLabel } from './registry'
import { foldedView, foldsCovering, snippetOf } from './graph-view'
import { NodeList } from './node-list'
import { Simulator } from './simulator'

const nodeTypes = { wa: VerticalNodeCard }
const EDGE_TYPE = 'smoothstep'
const GAP_BELOW = 70
/**
 * Past this many nodes the canvas draws only what is on screen and stops
 * animating its camera. Set from the load test (100 / 300 / 1000 nodes).
 */
const BIG_FLOW = 300

const labelOf = (n: Node | undefined) => {
  const kind = (n?.data as { kind?: NodeKind } | undefined)?.kind
  return kind ? (NODE_LABELS[kind] ?? kind) : 'Node'
}
const kindOf = (n: Node) => (n.data as { kind: NodeKind }).kind
const outputsOf = (n: Node) => {
  const data = n.data as unknown as NodeData
  return handlesOf({ id: n.id, type: data.kind, position: n.position, data })
}
const hasOutputs = (kind: NodeKind) =>
  handlesOf({ id: '', type: kind, position: { x: 0, y: 0 }, data: defaultData(kind) }).length > 0
const cannotInsert = (kind: NodeKind) =>
  `${NODE_LABELS[kind] ?? kind} tidak bisa disisipkan di tengah alur karena tidak punya lanjutan.`
const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))

/** Where the "add a node" menu was opened from, and where it sits on screen. */
type AddMenu = {
  source: string
  sourceHandle: string | null
  screen: { x: number; y: number }
  /** Flow position the node should land on, when the menu came from a drag. */
  drop?: { x: number; y: number }
}

type EditorProps = {
  flowId: string
  /** The live version when the editor opened; null when never published. */
  publishedVersion: number | null
  initial: FlowGraph
  templates: TemplateOption[]
  aiEndpoints: AiEndpointOption[]
}

const PINS_KEY = 'wa-flow-pins'

function readStored<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function writeStored(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

/**
 * Top-to-bottom flow editor: ribbon, node list, fold, undo and simulator.
 * Edits the flow's draft, saved as it changes, and publishes it from the
 * ribbon. What is live changes only on publish.
 */
export function VerticalFlowEditor({ templates, aiEndpoints, ...props }: EditorProps) {
  // The pinned ribbon buttons are a per-browser setting, so the canvas mounts
  // once storage has been read.
  const [pins, setPins] = useState<NodeKind[] | null>(null)
  useEffect(() => {
    const saved = readStored<NodeKind[]>(PINS_KEY)
    setPins(Array.isArray(saved) ? saved : DEFAULT_PINS)
  }, [])

  if (!pins) return <p className="p-6 text-xs text-fg-muted">Memuat…</p>

  return (
    <ReactFlowProvider>
      <TemplatesProvider value={templates}>
        <AiEndpointsProvider value={aiEndpoints}>
          <Canvas {...props} aiEndpoints={aiEndpoints} pins={pins} />
        </AiEndpointsProvider>
      </TemplatesProvider>
    </ReactFlowProvider>
  )
}

function Canvas({
  flowId,
  publishedVersion,
  initial,
  aiEndpoints,
  pins: initialPins,
}: Omit<EditorProps, 'templates'> & { pins: NodeKind[] }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(
    initial.nodes.map((n) => ({ id: n.id, type: 'wa', position: n.position, data: n.data as never })),
  )
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(
    initial.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? null,
      type: EDGE_TYPE,
    })),
  )

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [save, setSave] = useState<{ at: string } | { failed: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [liveVersion, setLiveVersion] = useState(publishedVersion)
  const [publishing, startPublish] = useTransition()
  const [menu, setMenu] = useState<AddMenu | null>(null)
  const [autoLayout, setAutoLayout] = useState(true)
  const [leftTab, setLeftTab] = useState<'add' | 'list'>('list')
  const [leftOpen, setLeftOpen] = useState(true)
  const [canvasQuery, setCanvasQuery] = useState('')
  const canvasSearch = useRef<HTMLInputElement>(null)
  const [simulatorOpen, setSimulatorOpen] = useState(false)
  const [simPath, setSimPath] = useState<string[]>([])
  const [pins, setPins] = useState<NodeKind[]>(initialPins)
  // One line of feedback over the canvas: why a button did nothing, or what
  // a check found. Clears itself.
  const [notice, setNotice] = useState<string | null>(null)
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 5000)
    return () => clearTimeout(t)
  }, [notice])

  const { screenToFlowPosition, fitBounds, setCenter, getZoom, zoomIn, zoomOut } = useReactFlow()
  const wrapper = useRef<HTMLDivElement>(null)
  const big = nodes.length > BIG_FLOW
  const duration = big ? 0 : 300

  const graph: FlowGraph = useMemo(
    () => ({
      nodes: nodes.map((n) => ({ id: n.id, type: kindOf(n), position: n.position, data: n.data as never })),
      edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? null })),
    }),
    [nodes, edges],
  )

  // The same nodes, but only replaced when one is added, removed or edited -
  // not when one is dragged or selected. Everything that reads what the flow
  // says rather than where it sits (validation, the list, folding, the
  // simulator) keys on this, so dragging a node does not re-check 1000 others.
  const stableRef = useRef<Node[]>(nodes)
  const stableNodes = useMemo(() => {
    const prev = stableRef.current
    const same =
      prev.length === nodes.length && prev.every((p, i) => p.id === nodes[i]!.id && p.data === nodes[i]!.data)
    if (!same) stableRef.current = nodes
    return stableRef.current
  }, [nodes])
  const logicGraph: FlowGraph = useMemo(
    () => ({
      nodes: stableNodes.map((n) => ({ id: n.id, type: kindOf(n), position: n.position, data: n.data as never })),
      edges: graph.edges,
    }),
    // graph.edges only changes with the edges themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stableNodes, edges],
  )

  const aiOpts = useMemo(
    () => ({
      aiEndpointIds: new Set(aiEndpoints.map((a) => a.id)),
      aiEndpointKinds: new Map(aiEndpoints.map((a) => [a.id, a.kind])),
    }),
    [aiEndpoints],
  )
  const issues = useMemo(() => validateFlow(logicGraph, aiOpts), [logicGraph, aiOpts])
  const variables = useMemo(() => [...assignedVariables(logicGraph)].sort(), [logicGraph])
  const errors = issues.filter((i) => i.severity === 'error')
  const warnings = issues.filter((i) => i.severity === 'warning')
  const worstIssue = useMemo(() => {
    const worst = new Map<string, 'error' | 'warning'>()
    for (const i of issues) {
      if (!i.nodeId) continue
      if (i.severity === 'error' || !worst.has(i.nodeId)) worst.set(i.nodeId, i.severity)
    }
    return worst
  }, [issues])

  // --- Autosave: the flow's draft, never what is live. ---
  const graphRef = useRef(graph)
  graphRef.current = graph
  // Only what the flow says counts as an edit: which nodes, what they hold,
  // how they connect. Where they sit does not - the layout is redone every
  // time the flow opens, so opening, tidying or dragging alone writes
  // nothing. Positions still travel along with the next real save.
  const content = useMemo(
    () =>
      JSON.stringify({
        nodes: logicGraph.nodes.map((n) => [n.id, n.data]),
        edges: logicGraph.edges.map((e) => [e.id, e.source, e.target, e.sourceHandle ?? null]),
      }),
    [logicGraph],
  )
  // Compared by content, not by "first render": React runs effects twice in
  // development, and a flow nobody touched must not be written as if edited.
  const lastSaved = useRef<string | null>(null)
  useEffect(() => {
    if (lastSaved.current === null) lastSaved.current = content
    if (content === lastSaved.current) return
    // Debounced so typing does not fire a write per key.
    const t = setTimeout(async () => {
      const res = await saveDraft(flowId, graphRef.current)
      // A failed autosave must not look like an unsaved draft - that is how
      // work gets lost silently.
      if ('savedAt' in res) lastSaved.current = content
      setSave('savedAt' in res ? { at: new Date(res.savedAt).toLocaleTimeString('id-ID') } : { failed: res.error })
    }, 900)
    return () => clearTimeout(t)
  }, [content, flowId])

  const publish = () =>
    startPublish(async () => {
      // Whatever is on the canvas is what goes live, even if the autosave
      // has not caught up yet.
      const saved = await saveDraft(flowId, graphRef.current)
      if ('error' in saved) return setNotice(`Gagal menyimpan: ${saved.error}`)
      lastSaved.current = content
      setSave({ at: new Date(saved.savedAt).toLocaleTimeString('id-ID') })
      const res = await publishFlow(flowId)
      if (res.ok) {
        setLiveVersion(res.version)
        setNotice(`Terbit sebagai v${res.version}. Pesan masuk berikutnya memakai versi ini.`)
      } else {
        setNotice(`Belum bisa terbit: ${res.issues.join(' ')}`)
      }
    })

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(graphRef.current, null, 2))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setNotice('Browser menolak menyalin ke clipboard.')
    }
  }

  // --- Undo / redo: snapshots of the graph, coalesced while dragging. ---
  const history = useRef({ past: [] as string[], future: [] as string[], current: null as string | null })
  const [, setHistoryTick] = useState(0)
  const record = useCallback((key: string) => {
    const h = history.current
    if (h.current === key) return
    if (h.current !== null) h.past = [...h.past.slice(-99), h.current]
    h.current = key
    h.future = []
    setHistoryTick((t) => t + 1)
  }, [])
  // The graph object last recorded; a different one means there is
  // something to undo even before the debounce has recorded it.
  const recordedGraph = useRef<FlowGraph | null>(null)
  useEffect(() => {
    if (history.current.current === null) {
      history.current.current = JSON.stringify(graph)
      recordedGraph.current = graph
      return
    }
    const t = setTimeout(() => {
      record(JSON.stringify(graph))
      recordedGraph.current = graph
    }, 400)
    return () => clearTimeout(t)
  }, [graph, record])

  const applySnapshot = useCallback(
    (key: string) => {
      const g = JSON.parse(key) as FlowGraph
      setNodes((prev) => {
        const old = new Map(prev.map((n) => [n.id, n]))
        return g.nodes.map((n) => ({
          id: n.id,
          type: 'wa',
          position: n.position,
          data: n.data as never,
          measured: old.get(n.id)?.measured,
        }))
      })
      setEdges(g.edges.map((e) => ({ ...e, type: EDGE_TYPE })))
      setSelectedId((id) => (id && g.nodes.some((n) => n.id === id) ? id : null))
    },
    [setNodes, setEdges],
  )
  const undo = useCallback(() => {
    record(JSON.stringify(graphRef.current))
    const h = history.current
    const prev = h.past.pop()
    if (!prev) return setNotice('Belum ada yang bisa diurungkan.')
    h.future.push(h.current!)
    h.current = prev
    applySnapshot(prev)
    setHistoryTick((t) => t + 1)
  }, [record, applySnapshot])
  const redo = useCallback(() => {
    const h = history.current
    const next = h.future.pop()
    if (!next) return setNotice('Belum ada yang bisa diulangi.')
    h.past.push(h.current!)
    h.current = next
    applySnapshot(next)
    setHistoryTick((t) => t + 1)
  }, [applySnapshot])

  // --- Folding: a view setting kept in this browser, never in the draft. ---
  const foldKey = `wa-flow-fold:${flowId}`
  const [folded, setFolded] = useState<Set<string>>(() => new Set())
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(foldKey) ?? '[]')
      if (Array.isArray(saved)) setFolded(new Set(saved.filter((x) => typeof x === 'string')))
    } catch {
      // Private window or blocked storage: start unfolded.
    }
  }, [foldKey])
  useEffect(() => {
    try {
      localStorage.setItem(foldKey, JSON.stringify([...folded]))
    } catch {
      // Not saving a fold is harmless.
    }
  }, [folded, foldKey])
  const { hidden, hiddenUnder } = useMemo(() => foldedView(stableNodes, edges, folded), [stableNodes, edges, folded])
  const toggleFold = useCallback((id: string) => {
    setFolded((f) => {
      const next = new Set(f)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])
  const reveal = useCallback(
    (id: string) => {
      const covering = foldsCovering(id, edges, folded)
      if (covering.length) setFolded((f) => new Set([...f].filter((x) => !covering.includes(x))))
    },
    [edges, folded],
  )
  // A node folded out of sight cannot stay open in the inspector.
  useEffect(() => {
    if (selectedId && hidden.has(selectedId)) setSelectedId(null)
  }, [hidden, selectedId])

  // --- Layout ---
  // Runs once every node has been measured, so a node added a moment ago is
  // placed by its real height rather than a guess. Folded-away nodes keep
  // their place and take no room.
  const pendingLayout = useRef<{ focus?: string; fit?: boolean } | null>(null)
  const [layoutTick, setLayoutTick] = useState(0)
  const requestLayout = useCallback((after: { focus?: string; fit?: boolean }) => {
    pendingLayout.current = after
    setLayoutTick((t) => t + 1)
  }, [])

  // Fits the view to every shown node. React Flow's own fitView only counts
  // nodes it has drawn, and a big flow draws only what is on screen.
  const fitAll = useCallback(
    (list: Node[]) => {
      const box = boundsOf(list)
      if (box) void fitBounds(box, { padding: 0.1, duration })
    },
    [fitBounds, duration],
  )

  const focusNode = useCallback(
    (id: string, position: { x: number; y: number }) => {
      const n = nodes.find((x) => x.id === id)
      const w = n?.measured?.width ?? CARD_WIDTH
      const h = n?.measured?.height ?? 110
      setCenter(position.x + w / 2, position.y + h / 2, { zoom: getZoom(), duration })
    },
    [nodes, setCenter, getZoom, duration],
  )

  const layoutTries = useRef(0)
  useEffect(() => {
    const req = pendingLayout.current
    if (!req) return
    const shown = nodes.filter((n) => !hidden.has(n.id))
    // Wait (briefly) only for the node just added. Nodes off screen in a big
    // flow are never drawn, so never measured; they are placed by estimate.
    const focus = req.focus ? shown.find((n) => n.id === req.focus) : undefined
    if (focus && !focus.measured?.width && layoutTries.current < 10) {
      layoutTries.current++
      const t = setTimeout(() => setLayoutTick((x) => x + 1), 50)
      return () => clearTimeout(t)
    }
    layoutTries.current = 0
    pendingLayout.current = null
    const pos = layoutTopDown(
      shown,
      edges.filter((e) => !hidden.has(e.source) && !hidden.has(e.target)),
    )
    setNodes((ns) => ns.map((n) => (pos.has(n.id) ? { ...n, position: pos.get(n.id)! } : n)))
    requestAnimationFrame(() => {
      if (req.fit) fitAll(shown.map((n) => ({ ...n, position: pos.get(n.id) ?? n.position })))
      else if (req.focus && pos.has(req.focus)) focusNode(req.focus, pos.get(req.focus)!)
    })
  }, [nodes, edges, hidden, layoutTick, setNodes, fitAll, focusNode])

  // Lay the flow out top to bottom on opening: one drawn side to side in the
  // old editor gets its new shape, one already tidy stays put (and so is not
  // saved again).
  useEffect(() => {
    requestLayout({ fit: true })
  }, [requestLayout])

  // Folding changes what takes room.
  const firstFold = useRef(true)
  useEffect(() => {
    if (firstFold.current) {
      firstFold.current = false
      return
    }
    if (autoLayout) requestLayout({})
  }, [folded, autoLayout, requestLayout])

  const newNodeData = useCallback(
    (kind: NodeKind): NodeData => {
      const data = defaultData(kind)
      // With only one AI of the right kind saved there is nothing to choose; pick it.
      if (data.kind === 'askAi' || data.kind === 'aiRoute') {
        const usable = aiEndpoints.filter((a) => a.kind === (data.kind === 'askAi' ? 'ANSWER' : 'ROUTE'))
        if (usable.length === 1) data.endpointId = usable[0]!.id
      }
      return data
    },
    [aiEndpoints],
  )

  // One edge per output: wiring an output that is already wired rewires it.
  const onConnect = useCallback(
    (c: Connection) => {
      const handle = c.sourceHandle ?? null
      setEdges((es) => [
        ...es.filter((e) => !(e.source === c.source && (e.sourceHandle ?? null) === handle)),
        { id: nanoid(8), source: c.source, target: c.target, sourceHandle: handle, type: EDGE_TYPE },
      ])
      if (autoLayout) requestLayout({})
    },
    [setEdges, autoLayout, requestLayout],
  )

  // Dragging an output into empty space opens the menu there; dropping it on
  // a node's body (not only its small top handle) wires it to that node.
  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
      if (state.isValid || !state.fromNode || state.fromHandle?.type !== 'source') return
      const point = 'changedTouches' in event ? event.changedTouches[0]! : event
      const source = state.fromNode.id
      const sourceHandle = state.fromHandle.id ?? null

      const target = document
        .elementFromPoint(point.clientX, point.clientY)
        ?.closest('.react-flow__node')
        ?.getAttribute('data-id')
      if (target) {
        const kind = (nodes.find((n) => n.id === target)?.data as { kind?: NodeKind } | undefined)?.kind
        if (target !== source && kind !== 'trigger') onConnect({ source, sourceHandle, target, targetHandle: null })
        return
      }

      const screen = { x: point.clientX, y: point.clientY }
      setMenu({ source, sourceHandle, screen, drop: screenToFlowPosition(screen) })
    },
    [nodes, onConnect, screenToFlowPosition],
  )

  const openFromHandle = useCallback(
    (source: string, sourceHandle: string | null, screen: { x: number; y: number }) =>
      setMenu({ source, sourceHandle, screen }),
    [],
  )

  const wiredEdge = (source: string, handle: string | null) =>
    edges.find((e) => e.source === source && (e.sourceHandle ?? null) === handle)
  const nodeById = useCallback((id: string | null) => nodes.find((n) => n.id === id), [nodes])

  // The children drawn under each node. A node that still has some cannot be
  // deleted: deleting it would cut them loose from the flow.
  const children = useMemo(() => spanningTree(stableNodes, edges).children, [stableNodes, edges])
  const triggerCount = nodes.filter((n) => kindOf(n) === 'trigger').length
  const deleteBlockedFor = useCallback(
    (id: string): Blocked => {
      const n = nodeById(id)
      if (n && kindOf(n) === 'trigger' && triggerCount <= 1) {
        return 'Trigger adalah titik mulai alur dan tidak bisa dihapus.'
      }
      const kids = children.get(id) ?? []
      if (kids.length === 0) return null
      const names = kids.map((k) => labelOf(nodeById(k)))
      return `Node ini masih punya ${kids.length} node di bawahnya (${names.join(', ')}). Hapus node di bawahnya dulu.`
    },
    [children, nodeById, triggerCount],
  )

  /**
   * Which output of a node the ribbon adds to: the only one, or the first
   * branch nothing is wired to yet.
   */
  const nextOutput = (n: Node): { handle: string | null } | { blocked: string } => {
    const outputs = outputsOf(n)
    if (outputs.length === 0) return { blocked: `${labelOf(n)} adalah node akhir, tidak bisa dilanjutkan.` }
    if (outputs.length === 1 && outputs[0]!.id === null) return { handle: null }
    const free = outputs.find((h) => !wiredEdge(n.id, h.id))
    if (free) return { handle: free.id }
    return {
      blocked: `Semua cabang ${labelOf(n)} sudah tersambung. Klik titik + di cabang yang mau disisipi, atau tambah cabang di panel kanan.`,
    }
  }

  /**
   * Add a node under one output of `source`. On an output that is already
   * wired the node goes in between: A -> new -> B, so it needs an output of
   * its own to carry B.
   */
  const addNode = (
    kind: NodeKind,
    source: string,
    sourceHandle: string | null,
    at: { drop?: { x: number; y: number }; screenX?: number } = {},
  ) => {
    const src = nodeById(source)
    if (!src) return
    const id = nanoid(8)
    const data = newNodeData(kind)
    const outputs = handlesOf({ id, type: kind, position: { x: 0, y: 0 }, data })
    const wired = wiredEdge(source, sourceHandle)
    if (wired && outputs.length === 0) return setNotice(cannotInsert(kind))

    const position = at.drop
      ? { x: at.drop.x - CARD_WIDTH / 2, y: at.drop.y }
      : {
          x:
            at.screenX !== undefined
              ? screenToFlowPosition({ x: at.screenX, y: 0 }).x - CARD_WIDTH / 2
              : src.position.x + ((src.measured?.width ?? CARD_WIDTH) - CARD_WIDTH) / 2,
          y: src.position.y + (src.measured?.height ?? 110) + GAP_BELOW,
        }

    // Adding under a folded node would put the new node out of sight.
    if (folded.has(source)) toggleFold(source)
    setNodes((ns) => [
      ...ns.map((n) => (n.selected ? { ...n, selected: false } : n)),
      { id, type: 'wa', position, data: data as never, selected: true },
    ])
    setEdges((es) => {
      const added: Edge[] = [{ id: nanoid(8), source, sourceHandle, target: id, type: EDGE_TYPE }]
      if (!wired) return [...es, ...added]
      added.push({ id: nanoid(8), source: id, sourceHandle: outputs[0]!.id, target: wired.target, type: EDGE_TYPE })
      return [...es.filter((e) => e.id !== wired.id), ...added]
    })
    setSelectedId(id)
    setMenu(null)
    if (autoLayout) requestLayout({ focus: id })
    else focusNode(id, position)
  }

  const addFromMenu = (kind: NodeKind) => {
    if (!menu) return
    addNode(kind, menu.source, menu.sourceHandle, menu.drop ? { drop: menu.drop } : { screenX: menu.screen.x })
  }

  const selected = nodeById(selectedId) ?? null

  // What the ribbon's add buttons would do with the selected node.
  const addBlocked = (kind: NodeKind | null): Blocked => {
    if (!selected) return 'Pilih node dulu di kanvas, lalu pilih jenis node untuk lanjutannya.'
    const next = nextOutput(selected)
    if ('blocked' in next) return next.blocked
    if (kind && wiredEdge(selected.id, next.handle) && !hasOutputs(kind)) return cannotInsert(kind)
    return null
  }

  const addAfterSelected = (kind: NodeKind) => {
    if (!selected) return
    const next = nextOutput(selected)
    if ('blocked' in next) return setNotice(next.blocked)
    addNode(kind, selected.id, next.handle)
  }

  const openMoreMenu = (screen: { x: number; y: number }) => {
    if (!selected) return setNotice('Pilih node dulu di kanvas, lalu pilih jenis node untuk lanjutannya.')
    const next = nextOutput(selected)
    if ('blocked' in next) return setNotice(next.blocked)
    setMenu({ source: selected.id, sourceHandle: next.handle, screen })
  }

  const duplicateSelected = () => {
    if (!selected) return
    const id = nanoid(8)
    const position = { x: selected.position.x + (selected.measured?.width ?? CARD_WIDTH) + 40, y: selected.position.y }
    setNodes((ns) => [
      ...ns.map((n) => (n.selected ? { ...n, selected: false } : n)),
      { id, type: 'wa', position, data: structuredClone(selected.data) as never, selected: true },
    ])
    setSelectedId(id)
    setNotice('Node diduplikat tanpa sambungan. Tarik titik + dari node lain ke node ini untuk menyambungkannya.')
    focusNode(id, position)
  }

  const togglePin = (kind: NodeKind) => {
    const next = pins.includes(kind) ? pins.filter((k) => k !== kind) : [...pins, kind]
    if (next.length > MAX_PINS) return setNotice(`Maksimal ${MAX_PINS} tombol disematkan. Lepas satu dulu.`)
    setPins(next)
    writeStored(PINS_KEY, next)
  }

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      const kind = event.dataTransfer.getData('application/wa-node') as NodeKind
      if (!kind) return
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY })
      const id = nanoid(8)
      setNodes((ns) => [...ns, { id, type: 'wa', position, data: newNodeData(kind) as never }])
      setSelectedId(id)
    },
    [screenToFlowPosition, setNodes, newNodeData],
  )

  const updateNode = useCallback(
    (id: string, data: unknown) => setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: data as never } : n))),
    [setNodes],
  )

  const deleteRef = useRef<(id: string) => void>(() => {})
  const deleteFromCard = useCallback((id: string) => deleteRef.current(id), [])

  const deleteNode = (id: string) => {
    const blocked = deleteBlockedFor(id)
    if (blocked) return setNotice(blocked)
    setNodes((ns) => ns.filter((n) => n.id !== id))
    setEdges((es) => es.filter((e) => e.source !== id && e.target !== id))
    setFolded((f) => (f.has(id) ? new Set([...f].filter((x) => x !== id)) : f))
    setSelectedId(null)
    if (autoLayout) requestLayout({})
  }
  deleteRef.current = deleteNode

  // The Delete/Backspace key goes through the same rule. Deleting a node
  // together with everything under it is fine, so a node only stays when one
  // of its children is not being deleted along with it - and the last
  // trigger always stays.
  const onBeforeDelete = async ({ nodes: doomed, edges: doomedEdges }: { nodes: Node[]; edges: Edge[] }) => {
    const ids = new Set(doomed.map((n) => n.id))
    const triggers = nodes.filter((n) => kindOf(n) === 'trigger').map((n) => n.id)
    if (triggers.length > 0 && triggers.every((t) => ids.has(t))) ids.delete(triggers[0]!)
    let changed = true
    while (changed) {
      changed = false
      for (const id of ids) {
        if ((children.get(id) ?? []).some((k) => !ids.has(k))) {
          ids.delete(id)
          changed = true
        }
      }
    }
    const kept = doomed.filter((n) => !ids.has(n.id))
    if (kept.length > 0) setNotice(deleteBlockedFor(kept[0]!.id) ?? 'Node ini tidak bisa dihapus.')
    const keptIds = new Set(kept.map((n) => n.id))
    if (selectedId && ids.has(selectedId)) setSelectedId(null)
    return {
      nodes: doomed.filter((n) => ids.has(n.id)),
      // Edges the user picked on their own go; edges that only went because
      // their node was going stay with the node.
      edges: doomedEdges.filter(
        (e) => ids.has(e.source) || ids.has(e.target) || (!keptIds.has(e.source) && !keptIds.has(e.target)),
      ),
    }
  }

  const pickNode = useCallback(
    (id: string) => {
      const n = nodes.find((x) => x.id === id)
      if (!n) return
      reveal(id)
      setSelectedId(id)
      setNodes((ns) => ns.map((x) => (x.selected !== (x.id === id) ? { ...x, selected: x.id === id } : x)))
      requestAnimationFrame(() => focusNode(id, n.position))
    },
    [nodes, reveal, setNodes, focusNode],
  )

  const validate = () => {
    if (issues.length === 0) return setNotice('Tidak ada masalah. Desain ini lolos validasi.')
    const first = issues.find((i) => i.nodeId && i.severity === 'error') ?? issues.find((i) => i.nodeId)
    setNotice(
      `${errors.length} error, ${warnings.length} peringatan.` +
        (first ? ' Node pertama yang bermasalah sudah dipilih.' : ' Lihat daftar di bawah kanvas.'),
    )
    if (first?.nodeId) pickNode(first.nodeId)
  }

  // Keyboard: Ctrl+Z / Ctrl+Y for the canvas, "/" for the node gallery,
  // Ctrl+K for the canvas search. Never while typing, where those keys
  // belong to the text field - except Ctrl+K, which no field uses.
  const keys = useRef({ undo, redo, openMoreMenu })
  keys.current = { undo, redo, openMoreMenu }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        canvasSearch.current?.focus()
        canvasSearch.current?.select()
        return
      }
      if (isTyping(e.target)) return
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault()
        keys.current.undo()
      } else if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault()
        keys.current.redo()
      } else if (e.key === '/' && !mod) {
        e.preventDefault()
        const box = wrapper.current?.getBoundingClientRect()
        keys.current.openMoreMenu(box ? { x: box.left + box.width / 2, y: box.top + 40 } : { x: 400, y: 200 })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const visited = useMemo(() => new Set(simPath), [simPath])
  const sources = useMemo(() => new Set(edges.map((e) => e.source)), [edges])
  // Reuse each node's decorated data while neither it nor its marks changed,
  // so selecting or dragging one node does not redraw every card.
  const decoratedCache = useRef(new Map<string, { node: Node; key: string; out: Node }>())
  const decorated = useMemo(() => {
    const cache = decoratedCache.current
    const next = new Map<string, { node: Node; key: string; out: Node }>()
    const result = nodes.map((n) => {
      const marks = {
        __issue: worstIssue.get(n.id),
        __canFold: sources.has(n.id),
        __folded: folded.has(n.id),
        __hiddenCount: hiddenUnder.get(n.id),
        __visited: visited.has(n.id),
      }
      const key = JSON.stringify(marks) + (hidden.has(n.id) ? 'h' : '')
      const hit = cache.get(n.id)
      const out =
        hit && hit.node === n && hit.key === key
          ? hit.out
          : { ...n, hidden: hidden.has(n.id), data: { ...n.data, ...marks } }
      next.set(n.id, { node: n, key, out })
      return out
    })
    decoratedCache.current = next
    return result
  }, [nodes, sources, worstIssue, folded, hiddenUnder, hidden, visited])
  const shownEdges = useMemo(
    () =>
      edges.map((e) => {
        const hide = hidden.has(e.source) || hidden.has(e.target)
        const onPath = visited.has(e.source) && visited.has(e.target)
        return hide || onPath
          ? { ...e, hidden: hide, style: onPath ? { stroke: 'var(--color-ok)', strokeWidth: 2 } : e.style }
          : e
      }),
    [edges, hidden, visited],
  )

  const selectedNext = selected ? nextOutput(selected) : null
  const selectedHint = !selected
    ? 'Klik node di kanvas untuk menambah lanjutan.'
    : selectedNext && 'blocked' in selectedNext
      ? selectedNext.blocked
      : selectedNext?.handle
        ? `Node baru disambung ke cabang "${outputsOf(selected).find((h) => h.id === selectedNext.handle)?.label}".`
        : 'Node baru disambung di bawahnya.'
  const live = liveVersion !== null ? ` · live v${liveVersion}` : ' · belum terbit'
  const saveText =
    save && 'failed' in save ? `Gagal menyimpan: ${save.failed}` : (save ? `Draf tersimpan ${save.at}` : 'Draf') + live

  return (
    <div className="flex h-full flex-col">
      <Ribbon
        selectedLabel={selected ? labelOf(selected) : null}
        selectedHint={selectedHint}
        pins={pins}
        addBlocked={addBlocked}
        onAdd={addAfterSelected}
        onMore={openMoreMenu}
        duplicateBlocked={selected ? null : 'Pilih node yang mau diduplikat.'}
        onDuplicate={duplicateSelected}
        deleteBlocked={selected ? deleteBlockedFor(selected.id) : 'Pilih node yang mau dihapus.'}
        onDelete={() => selected && deleteNode(selected.id)}
        canUndo={history.current.past.length > 0 || (recordedGraph.current !== null && recordedGraph.current !== graph)}
        canRedo={history.current.future.length > 0}
        onUndo={undo}
        onRedo={redo}
        onZoomIn={() => zoomIn({ duration: duration && 200 })}
        onZoomOut={() => zoomOut({ duration: duration && 200 })}
        onFit={() => fitAll(nodes.filter((n) => !hidden.has(n.id)))}
        onTidy={() => requestLayout({ fit: true })}
        autoLayout={autoLayout}
        onAutoLayout={setAutoLayout}
        onValidate={validate}
        issueCount={{ errors: errors.length, warnings: warnings.length }}
        simulatorOpen={simulatorOpen}
        onSimulator={() => setSimulatorOpen((o) => !o)}
        saveText={saveText}
        saveFailed={!!save && 'failed' in save}
        draftActions={
          <div className="flex gap-1">
            <button
              onClick={() => (errors.length > 0 ? validate() : publish())}
              disabled={publishing}
              title={errors.length > 0 ? 'Perbaiki error dulu' : 'Simpan versi baru dan jadikan live'}
              className={cn(
                'h-7 rounded-md bg-brand px-2.5 text-[12px] font-semibold text-on-brand hover:opacity-90 disabled:opacity-50',
                errors.length > 0 && 'opacity-50',
              )}
            >
              {publishing ? 'Menerbitkan…' : 'Terbitkan'}
            </button>
            <button onClick={copyJson} className="h-7 rounded-md border px-2 text-[12px] text-fg hover:bg-muted">
              {copied ? 'Tersalin' : 'Salin JSON'}
            </button>
          </div>
        }
        onBlocked={setNotice}
      />

      <div className="flex min-h-0 flex-1">
        {leftOpen && (
          <aside className="flex w-[270px] shrink-0 flex-col border-r bg-surface">
            <div className="flex shrink-0 items-center gap-2 px-4 pt-4 pb-2">
              <div role="tablist" className="flex flex-1 rounded-[10px] bg-muted p-1 text-[14px]">
                {(['add', 'list'] as const).map((tab) => (
                  <button
                    key={tab}
                    role="tab"
                    aria-selected={leftTab === tab}
                    onClick={() => setLeftTab(tab)}
                    className={cn(
                      'h-[30px] flex-1 rounded-lg transition-colors',
                      leftTab === tab ? 'bg-surface font-medium text-fg shadow-xs' : 'text-fg-muted hover:text-fg',
                    )}
                  >
                    {tab === 'list' ? 'Daftar' : 'Tambah'}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setLeftOpen(false)}
                title="Sembunyikan panel"
                className="flex size-[35px] shrink-0 items-center justify-center rounded-lg border text-fg hover:bg-muted"
              >
                <IconChevronLeft />
              </button>
            </div>
            {leftTab === 'list' ? (
              <>
                <p className="px-4 pb-1 text-[12px] text-fg-muted">{nodes.length} node di alur ini</p>
                <NodeList
                  nodes={stableNodes}
                  edges={edges}
                  selectedId={selectedId}
                  issues={worstIssue}
                  hidden={hidden}
                  storageKey={`wa-flow-list:${flowId}`}
                  onPick={pickNode}
                  onNotice={setNotice}
                />
              </>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">
                <p className="mb-2 text-[12px] text-fg-muted">Tarik ke kanvas untuk node lepas.</p>
                {PALETTE.map(({ group, kinds }) => (
                  <div key={group} className="mb-3">
                    <div className="mb-1 text-[10px] tracking-wide text-fg-muted uppercase">{group}</div>
                    {kinds.map((kind) => (
                      <div
                        key={kind}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('application/wa-node', kind)
                          e.dataTransfer.effectAllowed = 'move'
                        }}
                        className="mb-1 flex cursor-grab items-center gap-2 rounded-lg border bg-surface px-2.5 py-2 text-[13px] text-fg active:cursor-grabbing hover:bg-muted"
                      >
                        <span className="text-fg-muted">{NODE_REGISTRY[kind]?.icon}</span>
                        {NODE_LABELS[kind]}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </aside>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <div ref={wrapper} className="relative min-h-0 flex-1" onDrop={onDrop} onDragOver={(e) => e.preventDefault()}>
            <DeleteNodeContext.Provider value={deleteFromCard}>
              <ToggleFoldContext.Provider value={toggleFold}>
                <AddFromHandleContext.Provider value={openFromHandle}>
                  <ReactFlow
                    nodes={decorated}
                    edges={shownEdges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    onConnectEnd={onConnectEnd}
                    connectOnClick={false}
                    onBeforeDelete={onBeforeDelete}
                    onNodesDelete={() => autoLayout && requestLayout({})}
                    onNodeClick={(_, n) => setSelectedId(n.id)}
                    onPaneClick={() => {
                      setSelectedId(null)
                      setMenu(null)
                    }}
                    onMoveStart={() => setMenu(null)}
                    nodeTypes={nodeTypes}
                    onlyRenderVisibleElements={big}
                    onInit={() => fitAll(nodes.filter((n) => !hidden.has(n.id)))}
                    minZoom={0.05}
                    defaultEdgeOptions={{ type: EDGE_TYPE, animated: false, style: { strokeWidth: 1.5 } }}
                  >
                    {notice && (
                      <Panel position="top-center" className="!mt-16">
                        <p
                          role="status"
                          onClick={() => setNotice(null)}
                          className="max-w-md cursor-pointer rounded-md border bg-surface px-3 py-1.5 text-[12px] text-fg shadow-md"
                        >
                          {notice}
                        </p>
                      </Panel>
                    )}
                    {!notice && edges.length === 0 && (
                      <Panel position="top-center" className="!mt-16">
                        <p className="rounded-md border bg-surface px-3 py-1.5 text-[11px] text-fg-muted shadow-xs">
                          Klik tanda + di bawah node untuk menambah langkah berikutnya, atau tarik tanda itu ke node
                          lain untuk menyambungkannya.
                        </p>
                      </Panel>
                    )}
                    <Panel position="top-center" className="!mt-4">
                      <form
                        onSubmit={(e) => {
                          e.preventDefault()
                          const q = canvasQuery.trim().toLowerCase()
                          if (!q) return
                          const hit = nodes.find((n) => {
                            const d = n.data as unknown as NodeData
                            return `${shortLabel(d.kind)} ${NODE_REGISTRY[d.kind]?.label ?? ''} ${snippetOf(d)}`
                              .toLowerCase()
                              .includes(q)
                          })
                          if (hit) pickNode(hit.id)
                          else setNotice(`Tidak ada node yang cocok dengan “${canvasQuery.trim()}”.`)
                        }}
                        className="flex h-9 w-80 items-center gap-2 rounded-lg border bg-surface px-3 shadow-xs focus-within:border-accent"
                      >
                        <span className="text-fg-muted">
                          <IconSearch />
                        </span>
                        <input
                          ref={canvasSearch}
                          value={canvasQuery}
                          onChange={(e) => setCanvasQuery(e.target.value)}
                          placeholder="Cari node di kanvas…"
                          aria-label="Cari node di kanvas"
                          className="min-w-0 flex-1 bg-transparent text-[13px] text-fg outline-none placeholder:text-fg-muted"
                        />
                        <kbd className="rounded border px-1 font-sans text-[10px] text-fg-muted">Ctrl K</kbd>
                      </form>
                    </Panel>
                    <Panel position="bottom-left" className="!mb-4 !ml-4">
                      <div className="flex w-[46px] flex-col items-center rounded-lg border bg-surface py-1.5 text-fg shadow-xs">
                        <button
                          onClick={() => zoomIn({ duration: duration && 200 })}
                          title="Perbesar"
                          className="flex size-9 items-center justify-center rounded hover:bg-muted"
                        >
                          <IconPlus size={18} />
                        </button>
                        <button
                          onClick={() => zoomOut({ duration: duration && 200 })}
                          title="Perkecil"
                          className="flex size-9 items-center justify-center rounded hover:bg-muted"
                        >
                          <svg
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={1.8}
                            strokeLinecap="round"
                            aria-hidden
                          >
                            <path d="M5 12h14" />
                          </svg>
                        </button>
                        <button
                          onClick={() => fitAll(nodes.filter((n) => !hidden.has(n.id)))}
                          title="Pas layar"
                          className="flex size-9 items-center justify-center rounded hover:bg-muted"
                        >
                          <IconFit size={18} />
                        </button>
                      </div>
                    </Panel>
                    {!leftOpen && (
                      <Panel position="top-left" className="!mt-4 !ml-4">
                        <button
                          onClick={() => setLeftOpen(true)}
                          title="Tampilkan daftar node"
                          className="flex size-9 items-center justify-center rounded-lg border bg-surface text-fg shadow-xs hover:bg-muted"
                        >
                          <IconChevronRight />
                        </button>
                      </Panel>
                    )}
                    <Background gap={16} size={1} />
                    {!big && <MiniMap pannable zoomable className="!bg-muted" />}
                  </ReactFlow>
                </AddFromHandleContext.Provider>
              </ToggleFoldContext.Provider>
            </DeleteNodeContext.Provider>

            {menu && (
              <AddNodeMenu
                wrapper={wrapper.current}
                at={menu.screen}
                inserting={!!wiredEdge(menu.source, menu.sourceHandle)}
                pins={pins}
                onTogglePin={togglePin}
                onPick={addFromMenu}
                onClose={() => setMenu(null)}
              />
            )}
          </div>

          {issues.length > 0 && (
            <div className="max-h-32 shrink-0 overflow-y-auto border-t bg-surface px-3 py-2">
              {issues.map((i, idx) => (
                <p
                  key={idx}
                  onClick={() => i.nodeId && pickNode(i.nodeId)}
                  className={cn(
                    'cursor-pointer text-[11px] hover:underline',
                    i.severity === 'error' ? 'text-danger' : 'text-warn',
                  )}
                >
                  {i.message}
                </p>
              ))}
            </div>
          )}
        </div>

        {simulatorOpen ? (
          <Simulator
            flowId={flowId}
            graph={logicGraph}
            onPath={setSimPath}
            onPickNode={pickNode}
            onClose={() => {
              setSimulatorOpen(false)
              setSimPath([])
            }}
          />
        ) : (
          selected && (
            <Inspector
              key={selected.id}
              nodeId={selected.id}
              data={selected.data as never}
              variables={variables}
              icon={NODE_REGISTRY[kindOf(selected)]?.icon}
              onChange={(d) => updateNode(selected.id, d)}
              onDelete={() => deleteNode(selected.id)}
              onClose={() => setSelectedId(null)}
            />
          )
        )}
      </div>
    </div>
  )
}

const MENU_WIDTH = 240

/**
 * Searchable gallery of every node kind, opened at the output that was
 * clicked or dragged, from "Lainnya", or with "/". Enter adds the first
 * match, Escape closes it, the pin puts a kind on the ribbon.
 */
function AddNodeMenu({
  wrapper,
  at,
  inserting,
  pins,
  onTogglePin,
  onPick,
  onClose,
}: {
  wrapper: HTMLDivElement | null
  at: { x: number; y: number }
  inserting: boolean
  pins: NodeKind[]
  onTogglePin: (kind: NodeKind) => void
  onPick: (kind: NodeKind) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const box = wrapper?.getBoundingClientRect()
  const left = box ? Math.min(Math.max(at.x - box.left - MENU_WIDTH / 2, 8), box.width - MENU_WIDTH - 8) : at.x
  const top = box ? Math.min(at.y - box.top + 12, box.height - 320) : at.y

  // A node with no output cannot sit between two others.
  const usable = (kind: NodeKind) => !inserting || hasOutputs(kind)

  const q = query.trim().toLowerCase()
  const groups = PALETTE.map(({ group, kinds }) => ({
    group,
    kinds: kinds.filter((k) => k !== 'trigger' && usable(k) && (!q || (NODE_LABELS[k] ?? k).toLowerCase().includes(q))),
  })).filter((g) => g.kinds.length > 0)
  const first = groups[0]?.kinds[0]

  return (
    <div
      style={{ left, top: Math.max(top, 8), width: MENU_WIDTH }}
      className="absolute z-10 flex max-h-80 flex-col rounded-lg border bg-surface shadow-md"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
    >
      <div className="border-b p-2">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && first) onPick(first)
          }}
          placeholder={inserting ? 'Sisipkan node…' : 'Tambah node…'}
          className="h-7 w-full rounded-md border bg-surface px-2 text-[12px] text-fg outline-none focus:border-accent"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {groups.length === 0 && <p className="px-2 py-1.5 text-[11px] text-fg-muted">Tidak ada yang cocok.</p>}
        {groups.map(({ group, kinds }) => (
          <div key={group} className="mb-1">
            <div className="px-2 pt-1 text-[10px] text-fg-muted">{group}</div>
            {kinds.map((kind) => (
              <div
                key={kind}
                className={cn('group flex items-center rounded-md hover:bg-muted', kind === first && q && 'bg-muted')}
              >
                <button
                  onClick={() => onPick(kind)}
                  className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1 text-left text-[12px] text-fg"
                >
                  <span className="text-fg-muted">{NODE_REGISTRY[kind]?.icon}</span>
                  {NODE_LABELS[kind]}
                </button>
                <button
                  onClick={() => onTogglePin(kind)}
                  title={pins.includes(kind) ? 'Lepas dari ribbon' : 'Sematkan ke ribbon'}
                  aria-pressed={pins.includes(kind)}
                  className={cn(
                    'mr-1 rounded p-1 hover:bg-surface',
                    pins.includes(kind)
                      ? 'text-accent'
                      : 'text-fg-muted opacity-0 group-hover:opacity-100 focus:opacity-100',
                  )}
                >
                  <IconPin size={13} />
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
