'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@wa/db'
import { requireRole } from '@/lib/auth'
import {
  createDocument,
  deleteDocument,
  getDocument,
  searchKnowledge,
  updateDocument,
  type KnowledgeAnswer,
} from '@/features/knowledge/api/knowledge'
import { checkKnowledgeInput } from '@/features/knowledge/utils/knowledge-rules'
import { decodeRouteTarget, NO_ROUTE } from '@/features/knowledge/utils/knowledge-route'
import { checkRouteTarget, currentRouteLink, writeRouteLink } from '@/features/knowledge/api/knowledge-routes'

export type KnowledgeFormState = { error?: string; saved?: boolean }

export type KnowledgeTestResult = { ok: true; answer: KnowledgeAnswer; ms: number } | { ok: false; error: string }

function idOf(value: unknown) {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

/**
 * Creates a document, or replaces one when the form carries an id.
 *
 * The audit row keeps the full text on both sides: the service keeps no
 * history, so this is the only way back from a bad edit.
 */
export async function saveKnowledgeDoc(_prev: KnowledgeFormState, formData: FormData): Promise<KnowledgeFormState> {
  const user = await requireRole('ADMIN')

  const rawId = String(formData.get('id') ?? '')
  const id = rawId ? idOf(rawId) : null
  if (rawId && !id) return { error: 'Dokumen tidak ditemukan.' }

  const input = {
    category: String(formData.get('category') ?? '').trim() || 'Umum',
    title: String(formData.get('title') ?? '').trim(),
    content: String(formData.get('content') ?? '').trim(),
  }
  const bad = checkKnowledgeInput(input)
  if (bad) return { error: bad }

  // Checked before the service is called, so a bad menu saves nothing.
  const rawRoute = String(formData.get('route') ?? NO_ROUTE)
  const target = rawRoute === NO_ROUTE ? null : decodeRouteTarget(rawRoute)
  if (rawRoute !== NO_ROUTE && !target) return { error: 'Menu tujuan tidak dikenali.' }
  const checked = target ? await checkRouteTarget(user.orgId, target, { id, ...input }) : null
  if (checked && !checked.ok) return { error: checked.error }

  let before: {
    category: string
    title: string
    content: string
    route: { flowId: string; destinationId: string } | null
  } | null = null
  let savedId = id
  if (id) {
    const current = await getDocument(id)
    if (!current.ok) return { error: current.error }
    before = {
      category: current.data.category,
      title: current.data.title,
      content: current.data.content,
      route: await currentRouteLink(user.orgId, id),
    }

    const res = await updateDocument(id, input)
    if (!res.ok) return { error: res.error }
  } else {
    const res = await createDocument(input)
    if (!res.ok) return { error: res.error }
    savedId = res.data.id
  }

  const linked = target && checked?.ok ? { ...target, path: checked.path, texts: checked.texts } : null
  if (savedId) await writeRouteLink(user.orgId, user.id, savedId, linked)
  const route = linked ? { flowId: linked.flowId, destinationId: linked.destinationId, path: linked.path } : null

  await prisma.auditLog.create({
    data: {
      orgId: user.orgId,
      actorId: user.id,
      action: id ? 'knowledge.update' : 'knowledge.create',
      resourceType: 'KnowledgeDocument',
      resourceId: savedId ? String(savedId) : null,
      diff: before ? { from: before, to: { ...input, route } } : { ...input, route },
    },
  })

  revalidatePath('/knowledge')
  revalidatePath('/ai/examples')
  return { saved: true }
}

export async function deleteKnowledgeDoc(rawId: number): Promise<{ error?: string }> {
  const user = await requireRole('ADMIN')
  const id = idOf(rawId)
  if (!id) return { error: 'Dokumen tidak ditemukan.' }

  // Read first so the audit row can bring the text back if this was a mistake.
  const current = await getDocument(id)
  if (!current.ok) return { error: current.error }

  const route = await currentRouteLink(user.orgId, id)
  const res = await deleteDocument(id)
  if (!res.ok) return { error: res.error }
  // A deleted document stops teaching the router too.
  await writeRouteLink(user.orgId, user.id, id, null)

  await prisma.auditLog.create({
    data: {
      orgId: user.orgId,
      actorId: user.id,
      action: 'knowledge.delete',
      resourceType: 'KnowledgeDocument',
      resourceId: String(id),
      diff: { category: current.data.category, title: current.data.title, content: current.data.content, route },
    },
  })

  revalidatePath('/knowledge')
  revalidatePath('/ai/examples')
  return {}
}

/** Each test spends Gemini quota, so viewers only read. */
export async function testKnowledgeSearch(question: string): Promise<KnowledgeTestResult> {
  await requireRole('AGENT')

  const q = String(question ?? '').trim()
  if (!q) return { ok: false, error: 'Tulis pertanyaan uji dulu.' }
  if (q.length > 500) return { ok: false, error: 'Pertanyaan uji maksimum 500 karakter.' }

  const res = await searchKnowledge(q)
  return res.ok ? { ok: true, ...res.data } : res
}
