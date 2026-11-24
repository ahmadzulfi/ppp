import { cleanRouteExample, ROUTE_EXAMPLE_MAX } from '@wa/core/flow'

/**
 * A knowledge document pointed at a menu teaches Arahkan AI through the
 * ordinary route examples: its title and the start of its content become
 * examples for that menu row, so a question worded like the document lands
 * there. The router ignores examples past ROUTE_EXAMPLE_MAX characters.
 */

/** Form value for "not pointed at a menu". */
export const NO_ROUTE = ''

const SEPARATOR = '::'

export type KnowledgeRouteTarget = {
  flowId: string
  destinationId: string
}

/** One select carries both ids; menu row ids may hold "@", never "::". */
export function encodeRouteTarget(t: KnowledgeRouteTarget): string {
  return `${t.flowId}${SEPARATOR}${t.destinationId}`
}

export function decodeRouteTarget(value: string): KnowledgeRouteTarget | null {
  const at = value.indexOf(SEPARATOR)
  if (at <= 0) return null
  const flowId = value.slice(0, at)
  const destinationId = value.slice(at + SEPARATOR.length)
  return destinationId ? { flowId, destinationId } : null
}

/** The example questions a document becomes: its title, then its content. */
export function knowledgeExampleTexts(doc: { title: string; content: string }): string[] {
  const out: string[] = []
  for (const raw of [doc.title, doc.content]) {
    const text = clip(cleanRouteExample(raw), ROUTE_EXAMPLE_MAX)
    if (text && !out.some((t) => t.toLowerCase() === text.toLowerCase())) out.push(text)
  }
  return out
}

/** Cut at a word boundary when one is reasonably near the limit. */
function clip(text: string, max: number): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const space = cut.lastIndexOf(' ')
  return (space > max * 0.6 ? cut.slice(0, space) : cut).trim()
}
