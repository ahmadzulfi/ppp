import type { ReactNode } from 'react'
import { NODE_LABELS, type NodeKind } from '@wa/core/flow'
import { PALETTE } from '../defaults'
import {
  IconBranch,
  IconClock,
  IconCompass,
  IconContact,
  IconHeadset,
  IconImage,
  IconLink,
  IconList,
  IconMessage,
  IconPencil,
  IconReply,
  IconSparkle,
  IconStop,
  IconTag,
  IconTemplate,
  IconPlusCircle,
} from '@/components/ui/icons'

// Declared before the registry reads it at module load.
const ICONS: Record<NodeKind, ReactNode> = {
  trigger: <IconPlusCircle />,
  sendText: <IconMessage />,
  sendMedia: <IconImage />,
  sendButtons: <IconReply />,
  sendList: <IconList />,
  sendTemplate: <IconTemplate />,
  waitReply: <IconReply />,
  delay: <IconClock />,
  askAi: <IconSparkle />,
  aiRoute: <IconCompass />,
  condition: <IconBranch />,
  setVariable: <IconPencil />,
  assign: <IconContact />,
  tag: <IconTag />,
  handover: <IconHeadset />,
  end: <IconStop />,
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

/** Ribbon buttons for someone who has not pinned their own yet. */
export const DEFAULT_PINS: NodeKind[] = [
  'sendText',
  'condition',
  'aiRoute',
  'sendMedia',
  'sendList',
  'handover',
  'delay',
  'end',
]

/** Pinned buttons the ribbon has room for, beside "Lainnya". */
export const MAX_PINS = 8
