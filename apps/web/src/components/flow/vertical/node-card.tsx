'use client'

import { createContext, useContext } from 'react'
import { Handle, Position, useNodeConnections, type NodeProps } from '@xyflow/react'
import { handlesOf, NODE_LABELS, type FlowNode } from '@wa/core/flow'
import { cn } from '@/lib/utils'
import { Summary } from '../node-card'

/** Folds or unfolds the branch under a node. */
export const ToggleFoldContext = createContext<(nodeId: string) => void>(() => {})

/** View-only marks the editor paints onto node data; never saved. */
type ViewMarks = {
  __issue?: 'error' | 'warning'
  /** The node has something under it to fold. */
  __canFold?: boolean
  __folded?: boolean
  __hiddenCount?: number
  /** On the path the simulator's conversation took. */
  __visited?: boolean
}

/** Opens the "add a node here" menu for one output of one node. */
export const AddFromHandleContext = createContext<
  (nodeId: string, handleId: string | null, at: { x: number; y: number }) => void
>(() => {})

const targetClass = '!size-3 !border-2 !border-accent !bg-surface'
const SLOT = 76
export const CARD_WIDTH = 224

/**
 * One node, laid out for a top-to-bottom flow: input on top, every output on
 * the bottom edge. A node with several outputs gets one labelled slot per
 * output, left to right in handle order - the same order the auto layout
 * places their children in, so edges do not cross.
 */
export function VerticalNodeCard({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as FlowNode['data']
  const outputs = handlesOf({ id, type: nodeData.kind, position: { x: 0, y: 0 }, data: nodeData })
  const marks = data as ViewMarks
  const hasIssue = marks.__issue
  const toggleFold = useContext(ToggleFoldContext)
  const multi = !(outputs.length === 1 && outputs[0]!.id === null)

  return (
    <div
      style={{ width: multi ? Math.max(CARD_WIDTH, outputs.length * SLOT) : CARD_WIDTH }}
      className={cn(
        'rounded-lg border bg-surface text-left shadow-xs',
        selected && 'ring-2 ring-accent',
        marks.__visited && !selected && 'ring-2 ring-ok',
        hasIssue === 'error' && 'border-danger',
        hasIssue === 'warning' && 'border-warn',
      )}
    >
      {nodeData.kind !== 'trigger' && <Handle type="target" position={Position.Top} className={targetClass} />}

      <div
        className={cn(
          'flex items-center gap-1.5 rounded-t-lg border-b px-2.5 py-1.5 text-[11px]',
          nodeData.kind === 'trigger' ? 'bg-accent-bg text-accent' : 'bg-muted text-fg-muted',
        )}
      >
        <span>{NODE_LABELS[nodeData.kind]}</span>
        <span className="ml-auto flex items-center gap-1.5">
          {hasIssue === 'error' && <span className="text-danger">!</span>}
          {hasIssue === 'warning' && <span className="text-warn">!</span>}
          {marks.__canFold && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                toggleFold(id)
              }}
              title={marks.__folded ? 'Buka cabang di bawah node ini' : 'Lipat cabang di bawah node ini'}
              aria-expanded={!marks.__folded}
              className="nodrag flex size-4 items-center justify-center rounded text-fg-muted hover:bg-surface hover:text-fg"
            >
              {marks.__folded ? '▸' : '▾'}
            </button>
          )}
        </span>
      </div>

      <div className="px-2.5 py-2">
        <Summary data={nodeData} />
      </div>

      {marks.__folded && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            toggleFold(id)
          }}
          className="nodrag mx-2.5 mb-2 rounded border border-dashed px-1.5 py-0.5 text-[11px] text-fg-muted hover:bg-muted"
        >
          +{marks.__hiddenCount ?? 0} node tersembunyi
        </button>
      )}

      {outputs.length > 0 &&
        (multi ? (
          <div className="flex border-t">
            {outputs.map((h, i) => (
              <div
                key={h.id}
                className={cn(
                  'relative min-w-0 flex-1 px-1 pt-1 pb-2.5 text-center text-[10px] text-fg-muted',
                  i > 0 && 'border-l',
                )}
                title={h.label}
              >
                <span className="block truncate">{h.label || '—'}</span>
                <AddHandle nodeId={id} handleId={h.id} />
              </div>
            ))}
          </div>
        ) : (
          <AddHandle nodeId={id} handleId={null} />
        ))}
    </div>
  )
}

/**
 * An output that doubles as an "add" button: click it to pick the next node,
 * or drag it as usual to wire it to a node that already exists. An unwired
 * output shows a plus, a wired one a filled dot that turns into a plus on
 * hover (clicking it inserts a node in between).
 */
function AddHandle({ nodeId, handleId }: { nodeId: string; handleId: string | null }) {
  const open = useContext(AddFromHandleContext)
  const wired =
    useNodeConnections({ id: nodeId, handleType: 'source', handleId: handleId ?? undefined }).filter(
      (c) => (c.sourceHandle ?? null) === handleId,
    ).length > 0

  return (
    <Handle
      id={handleId ?? undefined}
      type="source"
      position={Position.Bottom}
      title={wired ? 'Klik untuk menyisipkan node' : 'Klik untuk menambah node, atau tarik ke node lain'}
      onClick={(e) => {
        e.stopPropagation()
        open(nodeId, handleId, { x: e.clientX, y: e.clientY })
      }}
      className={cn(
        '!flex !size-4 !cursor-pointer !items-center !justify-center !border-2 !border-accent text-[11px] leading-none font-semibold transition-transform hover:!scale-125',
        wired ? '!bg-accent text-transparent hover:!bg-surface hover:text-accent' : '!bg-surface text-accent',
      )}
    >
      <span className="pointer-events-none">+</span>
    </Handle>
  )
}
