'use server'

import { prisma } from '@wa/db'
import { aiConfigOf, routeExamplesFor } from '@wa/core'
import { callAi, callRoute } from '@wa/core/ai-call'
import type { RoutePick, RouteDestination } from '@wa/core/flow'
import { requireRole } from '@/lib/auth'

/**
 * What the editor's simulator needs from the outside world. Both call the
 * real AI endpoint, the same way the worker does, but leave no trace on it:
 * no lastUsedAt, no kept decision - a test is not traffic.
 */
export async function simulateAskAi(
  endpointId: string,
  question: string,
): Promise<{ ok: true; answer: string } | { ok: false; error: string }> {
  const user = await requireRole('SUPERVISOR')
  const endpoint = await prisma.aiEndpoint.findFirst({ where: { id: endpointId, orgId: user.orgId } })
  if (!endpoint) return { ok: false, error: 'AI tidak ditemukan' }

  const result = await callAi(aiConfigOf(endpoint), { pertanyaan: question, nama: 'Warga Uji', nomor: '6280000000000' })
  return result.ok ? { ok: true, answer: result.answer } : { ok: false, error: result.error }
}

/**
 * `flowId` is the flow whose kept examples help the router; the sandbox
 * passes the flow it was copied from, or null for a design started blank.
 */
export async function simulateRoute(
  flowId: string | null,
  endpointId: string,
  question: string,
  destinations: RouteDestination[],
): Promise<{ ok: true; pick: RoutePick } | { ok: false; error: string }> {
  const user = await requireRole('SUPERVISOR')
  const endpoint = await prisma.aiEndpoint.findFirst({ where: { id: endpointId, orgId: user.orgId } })
  if (!endpoint || endpoint.kind !== 'ROUTE') return { ok: false, error: 'AI tidak ditemukan' }
  const flow = flowId
    ? await prisma.flow.findFirst({ where: { id: flowId, orgId: user.orgId }, select: { id: true } })
    : null
  if (flowId && !flow) return { ok: false, error: 'Flow tidak ditemukan' }

  const examples = flow
    ? await routeExamplesFor(
        flow.id,
        destinations.map((d) => d.id),
      ).catch(() => [])
    : []
  const result = await callRoute(aiConfigOf(endpoint), { question, destinations, examples })
  if (!result.ok) return { ok: false, error: result.error }
  return {
    ok: true,
    pick: { destinationId: result.destinationId, score: result.score, candidates: result.candidates },
  }
}
