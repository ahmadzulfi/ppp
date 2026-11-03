'use client'

import { createContext, useContext } from 'react'
import { Handle, Position, useNodeConnections, type NodeProps } from '@xyflow/react'
import { handlesOf, type FlowNode } from '@wa/core/flow'
import { cn } from '@/utils/cn'
import { IconChevronDown, IconChevronUp, IconTrash } from '@/components/ui/icons'
import { Summary } from '../node-card'
import { NODE_REGISTRY, NODE_TONE, shortLabel } from './registry'

/** Folds or unfolds the branch under a node. */
export const ToggleFoldContext = createContext<(nodeId: string) => void>(() => {})

/** Deletes a node from the trash button in its header. */
export const DeleteNodeContext = createContext<(nodeId: string) => void>(() => {})

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

const targetClass = '!size-2.5 !border-2 !border-axis !bg-surface'
const SLOT = 76
export const CARD_WIDTH = 260

/**
 * One node, laid out for a top-to-bottom flow: input on top, every output on
 * the bottom edge. A node with several outputs gets one labelled slot per
 * output, left to right in handle order - the same order the auto layout
 * places their children in, so edges do not cross.
 *
 * The start and the end of a flow are drawn as pills, the steps between as
 * cards with a tinted header naming what the step does.
 */
export function VerticalNodeCard({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as FlowNode['data']
  const outputs = handlesOf({ id, type: nodeData.kind, position: { x: 0, y: 0 }, data: nodeData })
  const marks = data as ViewMarks
  const hasIssue = marks.__issue
  const toggleFold = useContext(ToggleFoldContext)
  const remove = useContext(DeleteNodeContext)
  const multi = !(outputs.length === 1 && outputs[0]!.id === null)

  // The border says, in order: picked, broken, or nothing special.
  const frame = (rest: string) =>
    cn(
      selected
        ? 'border-[1.5px] border-brand'
        : hasIssue === 'error'
          ? 'border border-danger'
          : hasIssue === 'warning'
            ? 'border border-warn'
            : rest,
      !selected && marks.__visited && 'ring-2 ring-ok',
    )

  if (nodeData.kind === 'trigger' || nodeData.kind === 'end') {
    const start = nodeData.kind === 'trigger'
    return (
      <div
        className={cn(
          'flex h-8 items-center justify-center gap-2 rounded-full px-5 text-[13px] font-semibold shadow-xs',
          start ? 'bg-ok-bg text-ok' : 'bg-surface text-fg',
          frame(start ? 'border-[1.5px] border-ok' : 'border border-axis'),
        )}
        title={NODE_REGISTRY[nodeData.kind]?.label}
      >
        {!start && <Handle type="target" position={Position.Top} className={targetClass} />}
        {start ? (
          <svg width="9" height="10" viewBox="0 0 9 10" fill="currentColor" aria-hidden>
            <path d="M0 0.8v8.4a.5.5 0 0 0 .76.43l7.4-4.2a.5.5 0 0 0 0-.86L.76.37A.5.5 0 0 0 0 .8Z" />
          </svg>
        ) : (
          <span aria-hidden className="size-1.5 bg-current" />
        )}
        <span className="max-w-40 truncate">{start ? <TriggerLabel data={nodeData} /> : 'Selesai'}</span>
        {hasIssue && <span className={hasIssue === 'error' ? 'text-danger' : 'text-warn'}>!</span>}
        {start && outputs.length > 0 && <AddHandle nodeId={id} handleId={null} selected={selected} />}
      </div>
    )
  }

  return (
    <div
      style={{ width: multi ? Math.max(CARD_WIDTH, outputs.length * SLOT) : CARD_WIDTH }}
      className={cn('relative rounded-[11px] bg-surface text-left shadow-[0_2px_4px_0_rgb(32_50_76/0.1)]', frame('border border-axis'))}
    >
      <Handle type="target" position={Position.Top} className={targetClass} />

      <div
        className={cn(
          'flex h-[29px] items-center gap-2 rounded-t-[10px] px-3 text-[11px] font-bold uppercase [&_svg]:size-3',
          NODE_TONE[nodeData.kind],
        )}
      >
        {NODE_REGISTRY[nodeData.kind]?.icon}
        <span className="truncate">{shortLabel(nodeData.kind)}</span>
        <span className="ml-auto flex items-center gap-3 text-fg-muted">
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
              className="nodrag flex size-4 items-center justify-center rounded hover:text-fg"
            >
              {marks.__folded ? <IconChevronDown /> : <IconChevronUp />}
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation()
              remove(id)
            }}
            title="Hapus node ini"
            className="nodrag flex size-4 items-center justify-center rounded text-danger hover:opacity-70"
          >
            <IconTrash />
          </button>
        </span>
      </div>

      <div className="px-3 py-2.5">
        <Summary data={nodeData} />
      </div>

      {marks.__folded && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            toggleFold(id)
          }}
          className="nodrag mx-3 mb-2.5 rounded-md border border-dashed px-1.5 py-0.5 text-[11px] text-fg-muted hover:bg-muted"
        >
          +{marks.__hiddenCount ?? 0} node tersembunyi
        </button>
      )}

      {outputs.length > 0 &&
        (multi ? (
          <div className="flex flex-col gap-1 px-3 pb-3.5">
            {outputs.map((h, i) => (
              <div key={h.id} className="relative truncate rounded-md bg-muted px-2.5 py-1 text-[13px] text-fg" title={h.label}>
                {/^\d/.test(h.label ?? '') || !h.label ? (h.label || '—') : `${i + 1} · ${h.label}`}
              </div>
            ))}
            <div className="absolute inset-x-0 bottom-0 flex">
              {outputs.map((h, i) => (
                <div key={h.id} className="relative flex-1">
                  <AddHandle nodeId={id} handleId={h.id} index={i + 1} selected={selected} />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <AddHandle nodeId={id} handleId={null} selected={selected} />
        ))}
    </div>
  )
}

function TriggerLabel({ data }: { data: FlowNode['data'] }) {
  const values = 'values' in data && Array.isArray(data.values) ? (data.values as string[]) : []
  return (
    <>
      Mulai
      {values.length > 0 && <span className="font-normal opacity-80"> · {values.join(', ')}</span>}
    </>
  )
}

/**
 * An output that doubles as an "add" button: click it to pick the next node,
 * or drag it as usual to wire it to a node that already exists. An unwired
 * output shows a plus; a wired branch of a multi-output node shows its
 * number, which turns into a plus on hover (clicking it inserts a node in
 * between).
 */
function AddHandle({
  nodeId,
  handleId,
  index,
  selected,
}: {
  nodeId: string
  handleId: string | null
  /** Branch number on a node with several outputs. */
  index?: number
  selected?: boolean
}) {
  const open = useContext(AddFromHandleContext)
  const wired =
    useNodeConnections({ id: nodeId, handleType: 'source', handleId: handleId ?? undefined }).filter(
      (c) => (c.sourceHandle ?? null) === handleId,
    ).length > 0
  const numbered = index !== undefined

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
        'group/add !flex !size-[22px] !cursor-pointer !items-center !justify-center !border-[1.5px] text-[11px] leading-none font-semibold transition-transform hover:!scale-110',
        numbered
          ? '!border-surface !bg-navy-800 text-white hover:!bg-accent'
          : selected
            ? '!border-brand !bg-brand text-on-brand'
            : '!border-axis !bg-surface text-fg-muted hover:!border-accent hover:text-accent',
      )}
    >
      <span className="pointer-events-none">
        {numbered ? (
          <>
            <span className="group-hover/add:hidden">{index}</span>
            <span className="hidden group-hover/add:inline">+</span>
          </>
        ) : (
          '+'
        )}
      </span>
    </Handle>
  )
}
