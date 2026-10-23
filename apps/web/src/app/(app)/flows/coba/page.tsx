import Link from 'next/link'
import { prisma, FlowStatus } from '@wa/db'
import { flowGraphSchema, type FlowGraph } from '@wa/core/flow'
import { requireRole } from '@/lib/auth'
import { VerticalFlowEditor } from '@/components/flow/vertical/editor'

export const dynamic = 'force-dynamic'

/** A blank design still needs its starting point to hang nodes under. */
const BLANK: FlowGraph = {
  nodes: [
    {
      id: 'mulai',
      type: 'trigger',
      position: { x: 0, y: 0 },
      data: { kind: 'trigger', match: 'keyword', values: ['halo'], caseSensitive: false },
    },
  ],
  edges: [],
}

/**
 * A place to try flow designs in the top-to-bottom editor. The design is
 * kept in the browser only: copying a flow here never changes that flow, and
 * nothing here can go live. Publishing stays on /flows/[id].
 */
export default async function FlowSandboxPage({ searchParams }: { searchParams: Promise<{ dari?: string }> }) {
  const user = await requireRole('SUPERVISOR')
  const { dari } = await searchParams

  const flows = await prisma.flow.findMany({
    where: { orgId: user.orgId, status: { not: FlowStatus.ARCHIVED } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, draftGraph: true },
  })
  const source = dari ? (flows.find((f) => f.id === dari) ?? null) : null
  const parsed = source ? flowGraphSchema.safeParse(source.draftGraph) : null

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
        <span className="text-sm text-fg">Coba desain alur</span>
        <span
          className="rounded bg-accent-bg px-1.5 py-px text-[10px] text-accent"
          title="Desain di halaman ini hanya tersimpan di browser ini dan tidak pernah terbit."
        >
          tidak terbit
        </span>
        <form className="ml-4 flex items-center gap-1.5 text-[12px]">
          <label htmlFor="dari" className="text-fg-muted">
            Mulai dari
          </label>
          <select
            id="dari"
            name="dari"
            defaultValue={source?.id ?? ''}
            className="h-7 rounded-md border bg-surface px-2 text-fg outline-none focus:border-accent"
          >
            <option value="">Kosong</option>
            {flows.map((f) => (
              <option key={f.id} value={f.id}>
                Salinan {f.name}
              </option>
            ))}
          </select>
          <button className="h-7 rounded-md border px-2 text-fg hover:bg-muted">Buka</button>
        </form>
        {source && parsed && !parsed.success && (
          <span className="text-[11px] text-warn">Draf flow itu tidak terbaca, dimulai dari kosong.</span>
        )}
        <Link href="/flows" className="ml-auto text-[11px] text-accent hover:underline">
          Kembali ke daftar Flow
        </Link>
      </div>
      <div className="min-h-0 flex-1">
        <VerticalFlowEditor
          key={source?.id ?? 'kosong'}
          storageKey={`wa-flow-coba:${source?.id ?? 'kosong'}`}
          sourceFlowId={source?.id ?? null}
          initial={parsed?.success ? parsed.data : BLANK}
          templates={templates}
          aiEndpoints={aiEndpoints}
        />
      </div>
    </div>
  )
}
