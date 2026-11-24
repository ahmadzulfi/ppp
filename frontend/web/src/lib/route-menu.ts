import { prisma, FlowStatus } from '@wa/db'
import { buildRouteCatalog, flowGraphSchema, type FlowGraph } from '@wa/core/flow'

/**
 * The menus Arahkan AI routes into, read by more than one feature: the AI
 * review pages and the knowledge base, which can point a document at a menu.
 */

export interface MenuOption {
  id: string
  path: string
}

/** Flows with an Arahkan AI node in their live or draft graph. */
export async function routingFlows(orgId: string): Promise<{ id: string; name: string }[]> {
  const flows = await prisma.flow.findMany({
    where: { orgId, status: { not: FlowStatus.ARCHIVED } },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, name: true, draftGraph: true, publishedVersion: { select: { graph: true } } },
  })
  return flows
    .filter((f) => routes(f.publishedVersion?.graph) || routes(f.draftGraph))
    .map((f) => ({ id: f.id, name: f.name }))
}

/**
 * The destinations an example can point at: the live menu, else the draft.
 * Examples are matched by id, and the live menu is what the router is sent.
 */
export async function flowMenu(orgId: string, flowId: string): Promise<MenuOption[]> {
  const flow = await prisma.flow.findFirst({
    where: { id: flowId, orgId },
    select: { draftGraph: true, publishedVersion: { select: { graph: true } } },
  })
  const graph = parseGraph(flow?.publishedVersion?.graph) ?? parseGraph(flow?.draftGraph)
  return graph ? buildRouteCatalog(graph).map((d) => ({ id: d.id, path: d.path })) : []
}

export function routes(graph: unknown): boolean {
  return !!parseGraph(graph)?.nodes.some((n) => n.data.kind === 'aiRoute')
}

function parseGraph(graph: unknown): FlowGraph | null {
  const parsed = flowGraphSchema.safeParse(graph)
  return parsed.success ? parsed.data : null
}
