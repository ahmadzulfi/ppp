import { prisma } from '@wa/db'
import { flowMenu, routingFlows, type MenuOption } from '@/lib/route-menu'
import { knowledgeExampleTexts, type KnowledgeRouteTarget } from '@/features/knowledge/utils/knowledge-route'

/**
 * Which menu each knowledge document points Arahkan AI at. The link is not
 * stored on its own: it is the route examples carrying the document's id, so
 * the router reads it the way it reads every other example.
 */

export interface RouteFlowOption {
  id: string
  name: string
  menu: MenuOption[]
}

export interface KnowledgeRouteLink extends KnowledgeRouteTarget {
  /** "Flow › Menu › Row", or null when the row is no longer on the menu. */
  label: string | null
}

/** Flows with Arahkan AI and their menus, for the document form. */
export async function routeFlowOptions(orgId: string): Promise<RouteFlowOption[]> {
  const flows = await routingFlows(orgId)
  const menus = await Promise.all(flows.map((f) => flowMenu(orgId, f.id)))
  return flows
    .map((f, i) => ({ ...f, menu: [...(menus[i] ?? [])].sort((a, b) => a.path.localeCompare(b.path, 'id')) }))
    .filter((f) => f.menu.length > 0)
}

/** Document id to the menu it points at. */
export async function knowledgeRouteLinks(
  orgId: string,
  flows: RouteFlowOption[],
): Promise<Map<number, KnowledgeRouteLink>> {
  const rows = await prisma.routeExample.findMany({
    where: { orgId, knowledgeDocId: { not: null } },
    distinct: ['knowledgeDocId'],
    select: { knowledgeDocId: true, flowId: true, destinationId: true, flow: { select: { name: true } } },
  })
  const byFlow = new Map(flows.map((f) => [f.id, f]))
  return new Map(
    rows.map((r) => {
      const path = byFlow.get(r.flowId)?.menu.find((m) => m.id === r.destinationId)?.path
      return [
        r.knowledgeDocId!,
        { flowId: r.flowId, destinationId: r.destinationId, label: path ? `${r.flow.name} › ${path}` : null },
      ]
    }),
  )
}

export type CheckedTarget = { ok: true; path: string; texts: string[] } | { ok: false; error: string }

/**
 * Whether a document may point at this menu row: the row is on the flow's
 * menu, and none of its example texts already teaches another row. Run
 * before the document is saved, so a refusal leaves nothing half done.
 */
export async function checkRouteTarget(
  orgId: string,
  target: KnowledgeRouteTarget,
  doc: { id: number | null; title: string; content: string },
): Promise<CheckedTarget> {
  const flow = await prisma.flow.findFirst({ where: { id: target.flowId, orgId }, select: { name: true } })
  if (!flow) return { ok: false, error: 'Flow tujuan tidak ditemukan.' }
  const dest = (await flowMenu(orgId, target.flowId)).find((d) => d.id === target.destinationId)
  if (!dest) return { ok: false, error: 'Menu tujuan sudah tidak ada di flow itu. Pilih menu lain.' }

  const texts = knowledgeExampleTexts(doc)
  const clash = await prisma.routeExample.findFirst({
    where: {
      flowId: target.flowId,
      destinationId: { not: target.destinationId },
      OR: texts.map((question) => ({ question: { equals: question, mode: 'insensitive' as const } })),
      // The document's own examples are about to be rewritten.
      ...(doc.id ? { NOT: { knowledgeDocId: doc.id } } : {}),
    },
    select: { question: true },
  })
  if (clash) {
    return {
      ok: false,
      error: `"${clash.question}" sudah jadi contoh untuk menu lain di flow ini. Ubah judulnya, atau hapus contoh itu di AI → Contoh.`,
    }
  }
  return { ok: true, path: `${flow.name} › ${dest.path}`, texts }
}

/**
 * Replaces a document's examples with ones for this target, or removes them
 * when target is null. Texts already taught to the same row are skipped:
 * the unique index allows one example per wording.
 */
export async function writeRouteLink(
  orgId: string,
  userId: string,
  docId: number,
  target: (KnowledgeRouteTarget & { texts: string[] }) | null,
) {
  await prisma.$transaction(async (tx) => {
    await tx.routeExample.deleteMany({ where: { orgId, knowledgeDocId: docId } })
    if (!target || target.texts.length === 0) return
    await tx.routeExample.createMany({
      data: target.texts.map((question) => ({
        orgId,
        flowId: target.flowId,
        destinationId: target.destinationId,
        question,
        knowledgeDocId: docId,
        createdById: userId,
      })),
      skipDuplicates: true,
    })
  })
}

/** For the audit row: where the document pointed before this save. */
export async function currentRouteLink(orgId: string, docId: number): Promise<KnowledgeRouteTarget | null> {
  const row = await prisma.routeExample.findFirst({
    where: { orgId, knowledgeDocId: docId },
    select: { flowId: true, destinationId: true },
  })
  return row
}
