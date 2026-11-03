import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@wa/db'
import { flowGraphSchema, type FlowGraph } from '@wa/core/flow'
import { requireUser } from '@/lib/auth'
import { VerticalFlowEditor } from '@/components/flow/vertical/editor'
import { defaultData } from '@/components/flow/defaults'

export const dynamic = 'force-dynamic'

/** A new or unreadable flow still needs its starting point to hang steps under. */
const STARTER: FlowGraph = {
  nodes: [{ id: 'mulai', type: 'trigger', position: { x: 0, y: 0 }, data: defaultData('trigger') }],
  edges: [],
}

export default async function FlowEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  const { id } = await params

  const flow = await prisma.flow.findUnique({
    where: { id },
    include: { publishedVersion: { select: { version: true } } },
  })
  if (!flow || flow.orgId !== user.orgId) notFound()

  const parsed = flowGraphSchema.safeParse(flow.draftGraph)

  // A flow is not tied to one number, so offer every approved template in the
  // org. The same name+language on two WABAs shows once.
  const rows = await prisma.template.findMany({
    where: { channel: { orgId: user.orgId }, metaStatus: 'APPROVED', category: { not: 'AUTHENTICATION' } },
    orderBy: [{ name: 'asc' }, { language: 'asc' }],
    select: { name: true, language: true, category: true, metaStatus: true, components: true },
  })
  const seen = new Set<string>()
  const templates = rows
    .filter((t) => {
      const k = `${t.name}:${t.language}`
      return seen.has(k) ? false : (seen.add(k), true)
    })
    .map((t) => ({ ...t, status: t.metaStatus }))

  const aiEndpoints = await prisma.aiEndpoint.findMany({
    where: { orgId: user.orgId },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, kind: true },
  })

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b bg-surface px-4">
        <span className="text-sm font-medium text-fg">{flow.name}</span>
        {!flow.enabled && (
          <span
            className="rounded bg-warn-bg px-1.5 py-px text-[10px] text-warn"
            title="Flow ini tidak menjawab pesan masuk. Aktifkan lagi dari daftar Flow."
          >
            nonaktif
          </span>
        )}
        {!parsed.success && (
          <span className="text-[11px] text-warn">Draf flow ini tidak terbaca, dimulai dari kosong.</span>
        )}
        <Link href="/flows" className="ml-auto text-[11px] text-accent hover:underline">
          Kembali ke daftar Flow
        </Link>
      </div>
      <div className="min-h-0 flex-1">
        <VerticalFlowEditor
          key={flow.id}
          flowId={flow.id}
          publishedVersion={flow.publishedVersion?.version ?? null}
          initial={parsed.success && parsed.data.nodes.length > 0 ? parsed.data : STARTER}
          templates={templates}
          aiEndpoints={aiEndpoints}
        />
      </div>
    </div>
  )
}
