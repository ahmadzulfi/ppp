import type { FlowGraph, FlowNode } from './schema.js'

/**
 * What an inbound WhatsApp message looks like to the trigger matcher.
 * Deliberately narrower than the webhook event: the matcher should not need
 * to know about Meta's payload shape.
 */
export interface InboundSignal {
  /** Text body, or the visible label of a tapped button. */
  text?: string
  /** Reply id of a tapped button or picked list row. */
  replyId?: string
  /** True when this is the contact's first message in a new conversation. */
  isNewConversation?: boolean
}

export interface TriggerMatch {
  node: FlowNode
  /** Which value matched, useful for logging why a flow fired. */
  matched: string
}

/**
 * Finds the first trigger in a graph that this message fires.
 *
 * Button payloads are checked before text, because a tapped button also
 * carries its label as text and matching the label would fire the wrong flow
 * whenever a button title happens to contain a keyword.
 */
export function matchTrigger(graph: FlowGraph, signal: InboundSignal): TriggerMatch | null {
  const triggers = graph.nodes.filter((n) => n.data.kind === 'trigger')

  if (signal.replyId) {
    for (const node of triggers) {
      if (node.data.kind !== 'trigger' || node.data.match !== 'buttonPayload') continue
      const hit = node.data.values.find((v) => v.trim() === signal.replyId)
      if (hit) return { node, matched: hit }
    }
  }

  const text = (signal.text ?? '').trim()

  for (const node of triggers) {
    if (node.data.kind !== 'trigger') continue
    const d = node.data

    if (d.match === 'newConversation') {
      if (signal.isNewConversation) return { node, matched: 'percakapan baru' }
      continue
    }

    // Fired by an explicit API call, never by an incoming message. A
    // fallback only fires once every flow has been asked: findFallbackTrigger.
    if (d.match === 'api' || d.match === 'buttonPayload' || d.match === 'fallback') continue
    if (!text) continue

    const haystack = d.caseSensitive ? text : text.toLowerCase()

    for (const raw of d.values) {
      const value = raw.trim()
      if (!value) continue
      const needle = d.caseSensitive ? value : value.toLowerCase()

      if (d.match === 'exact' && haystack === needle) return { node, matched: value }
      if (d.match === 'keyword' && haystack.includes(needle)) return { node, matched: value }
      if (d.match === 'regex') {
        try {
          if (new RegExp(value, d.caseSensitive ? '' : 'i').test(text)) return { node, matched: value }
        } catch {
          // An invalid regex is reported by validateFlow at publish time; at
          // runtime it must not take the whole inbound pipeline down.
        }
      }
    }
  }

  return null
}

/**
 * The graph's "no keyword matched" trigger, if it has one.
 *
 * Kept apart from matchTrigger because it must lose to every ordinary trigger
 * in every flow, not just in its own: the worker asks all flows first.
 */
export function findFallbackTrigger(graph: FlowGraph): FlowNode | null {
  return graph.nodes.find((n) => n.data.kind === 'trigger' && n.data.match === 'fallback') ?? null
}

/** The node an edge leads to, given the output handle taken. */
export function nextNodeId(
  graph: FlowGraph,
  fromId: string,
  handle: string | null = null,
): string | null {
  const edge = graph.edges.find(
    (e) => e.source === fromId && (e.sourceHandle ?? null) === handle,
  )
  return edge?.target ?? null
}

/** Lowercase words only: "Panduan!" and " panduan " compare equal. */
function normalizeChoice(text: string) {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** Shortest typed start of a title that still counts as naming it. */
const CHOICE_PREFIX_MIN = 3

/**
 * The menu option a typed message names, if it names exactly one: its
 * position ("2"), its whole title ("panduan"), or the start of its title
 * ("lacak" for "Lacak Status Permohonan"). Anything looser is a question,
 * not a choice, and is left to the menu's "teks bebas" output.
 */
export function matchChoice(options: { id: string; title: string }[], text: string): string | null {
  const typed = normalizeChoice(text)
  if (!typed) return null

  if (/^\d{1,2}$/.test(typed)) return options[Number(typed) - 1]?.id ?? null

  const titles = options.map((o) => ({ id: o.id, title: normalizeChoice(o.title) }))
  const exact = titles.filter((o) => o.title === typed)
  if (exact.length === 1) return exact[0]!.id
  if (exact.length > 1 || typed.length < CHOICE_PREFIX_MIN) return null

  const prefix = titles.filter((o) => o.title.startsWith(typed))
  return prefix.length === 1 ? prefix[0]!.id : null
}

/**
 * Words that always mean the same thing, whatever the bot is waiting for:
 * start over, or talk to a person. Without them a contact parked on a menu
 * cannot get out except by tapping, and keyword triggers never fire while a
 * session is running. Only whole messages count - "menu" does, "menu
 * pembuatan ktp" is a question.
 */
export type GlobalCommand = 'restart' | 'agent'

const GLOBAL_COMMANDS: Record<GlobalCommand, string[]> = {
  restart: ['menu', 'menu utama', 'mulai', 'mulai lagi', 'ulang', 'ulangi'],
  agent: [
    'cs',
    'admin',
    'operator',
    'petugas',
    'agen',
    'hubungi petugas',
    'hubungi cs',
    'hubungi admin',
    'bicara dengan petugas',
    'chat petugas',
    'minta petugas',
  ],
}

export function globalCommand(text: string): GlobalCommand | null {
  const typed = normalizeChoice(text)
  for (const [command, words] of Object.entries(GLOBAL_COMMANDS) as [GlobalCommand, string[]][]) {
    if (words.includes(typed)) return command
  }
  return null
}

/**
 * The global command a typed message should interrupt this session with, or
 * null to hand the message to the session as usual.
 *
 * The flow author's own wiring wins: a Tunggu balasan asked for this text, so
 * "menu" there is an answer; and a menu with its own "Menu Utama" row takes
 * "menu" as that row.
 */
export function interruptFor(graph: FlowGraph, parkedNodeId: string | null, text: string): GlobalCommand | null {
  const command = globalCommand(text)
  if (!command) return null

  const parked = graph.nodes.find((n) => n.id === parkedNodeId)
  const d = parked?.data
  if (d?.kind === 'waitReply') return null
  if (d?.kind === 'sendButtons' || d?.kind === 'sendList') {
    const options = d.kind === 'sendButtons' ? d.buttons : d.sections.flatMap((s) => s.rows)
    if (matchChoice(options, text)) return null
  }
  return command
}

/**
 * Where "menu" restarts a flow when no trigger answers to the word itself,
 * best first: the door a new conversation comes in through, then keyword
 * triggers, then the "no keyword matched" one. Never the API trigger.
 */
export function restartTriggers(graph: FlowGraph): FlowNode[] {
  const rank = (n: FlowNode) => {
    const m = n.data.kind === 'trigger' ? n.data.match : 'api'
    return m === 'newConversation' ? 0 : m === 'fallback' ? 2 : 1
  }
  return graph.nodes
    .filter((n) => n.data.kind === 'trigger' && n.data.match !== 'api' && n.data.match !== 'buttonPayload')
    .sort((a, b) => rank(a) - rank(b))
}
