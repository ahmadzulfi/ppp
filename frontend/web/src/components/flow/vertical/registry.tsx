import type { ReactNode } from 'react'
import { NODE_LABELS, type NodeKind } from '@wa/core/flow'
import { PALETTE } from '../defaults'
import {
  IconClock,
  IconContact,
  IconImage,
  IconLink,
  IconMessage,
  IconPencil,
  IconReply,
  IconSparkle,
  IconTag,
  IconTemplate,
  IconPlay,
  IconDiamond,
  IconUserRound,
  IconMenu,
  IconSquare,
} from '@/components/ui/icons'

// Declared before the registry reads it at module load.
const ICONS: Record<NodeKind, ReactNode> = {
  trigger: <IconPlay />,
  sendText: <IconMessage />,
  sendMedia: <IconImage />,
  sendButtons: <IconReply />,
  sendList: <IconMenu />,
  sendTemplate: <IconTemplate />,
  waitReply: <IconReply />,
  delay: <IconClock />,
  askAi: <IconSparkle />,
  aiRoute: <IconSparkle />,
  condition: <IconDiamond />,
  setVariable: <IconPencil />,
  assign: <IconContact />,
  tag: <IconTag />,
  handover: <IconUserRound />,
  end: <IconSquare />,
  httpRequest: <IconLink />,
}

/**
 * Every node kind the editor offers, with how it shows up in the ribbon and
 * menus. Built from the engine's own kinds (NODE_LABELS, PALETTE), so a kind
 * the bot cannot run never gets a button here.
 */
export const NODE_REGISTRY: Record<NodeKind, { label: string; group: string; icon: ReactNode }> =
  Object.fromEntries(
    PALETTE.flatMap(({ group, kinds }) =>
      kinds.map((kind) => [kind, { label: NODE_LABELS[kind] ?? kind, group, icon: ICONS[kind] }]),
    ),
  ) as Record<NodeKind, { label: string; group: string; icon: ReactNode }>

/** The one-word names the ribbon and node headers use, as in the design. */
export const SHORT_LABEL: Partial<Record<NodeKind, string>> = {
  trigger: 'Mulai',
  sendText: 'Pesan',
  sendMedia: 'Gambar',
  sendButtons: 'Tombol',
  sendList: 'Pilihan Menu',
  sendTemplate: 'Template',
  aiRoute: 'Arahkan AI',
  askAi: 'Tanya AI',
  handover: 'Ke Petugas',
  assign: 'Tugaskan',
  end: 'Selesai',
}

export const shortLabel = (kind: NodeKind) => SHORT_LABEL[kind] ?? NODE_LABELS[kind] ?? kind

/**
 * Header tint of a node card by what the node does: sending is blue, a
 * choice the contact makes is slate, AI is violet, handing to people is
 * amber, logic is teal. Classes, so dark mode follows the tokens.
 */
export const NODE_TONE: Record<NodeKind, string> = {
  trigger: 'bg-ok-bg text-ok',
  sendText: 'bg-label-blue-bg text-label-blue',
  sendMedia: 'bg-label-blue-bg text-label-blue',
  sendTemplate: 'bg-label-blue-bg text-label-blue',
  sendButtons: 'bg-accent-bg text-accent',
  sendList: 'bg-accent-bg text-accent',
  waitReply: 'bg-accent-bg text-accent',
  delay: 'bg-label-gray-bg text-label-gray',
  askAi: 'bg-label-purple-bg text-label-purple',
  aiRoute: 'bg-label-purple-bg text-label-purple',
  condition: 'bg-label-teal-bg text-label-teal',
  setVariable: 'bg-label-teal-bg text-label-teal',
  httpRequest: 'bg-label-teal-bg text-label-teal',
  assign: 'bg-label-yellow-bg text-label-yellow',
  handover: 'bg-label-yellow-bg text-label-yellow',
  tag: 'bg-label-yellow-bg text-label-yellow',
  end: 'bg-label-gray-bg text-label-gray',
}

/** Ribbon buttons for someone who has not pinned their own yet, as in the design. */
export const DEFAULT_PINS: NodeKind[] = [
  'trigger',
  'sendText',
  'sendMedia',
  'sendList',
  'condition',
  'aiRoute',
  'handover',
  'end',
]

/** Pinned buttons the ribbon has room for, beside "Lainnya". */
export const MAX_PINS = 8
