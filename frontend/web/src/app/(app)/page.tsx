import { prisma, CampaignStatus, Direction } from '@wa/db'
import { requireUser } from '@/lib/auth'
import { loadDashboard, loadOverview, PERIODS, RANGES, type Period, type RangeDays } from '@/features/dashboard/api/dashboard'
import { DashboardView, greeting } from '@/features/dashboard/components/dashboard-view'
import { DashboardOverview } from '@/features/dashboard/components/overview'

export const dynamic = 'force-dynamic'

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; channel?: string; period?: string }>
}) {
  const user = await requireUser()
  const sp = await searchParams
  const range = (RANGES as readonly number[]).includes(Number(sp.range)) ? (Number(sp.range) as RangeDays) : 7
  const period = (PERIODS as readonly string[]).includes(sp.period ?? '') ? (sp.period as Period) : 'today'

  const [org, channels, me] = await Promise.all([
    prisma.organization.findUnique({ where: { id: user.orgId }, select: { timezone: true } }),
    prisma.channel.findMany({
      where: { orgId: user.orgId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, displayPhone: true },
    }),
    // The session carries the name from sign-in time; read it fresh so a
    // rename shows without logging out and back in.
    prisma.user.findUnique({ where: { id: user.id }, select: { name: true } }),
  ])
  const tz = org?.timezone || 'Asia/Jakarta'
  const channelId = sp.channel && channels.some((c) => c.id === sp.channel) ? sp.channel : null
  const scope = { channel: { orgId: user.orgId }, ...(channelId ? { channelId } : {}) }
  const now = new Date()

  const [overview, d, unreadList, closingSoon, recentInbound, campaigns] = await Promise.all([
    loadOverview(user.orgId, tz, period, channelId),
    loadDashboard(user.orgId, range, channelId),
    prisma.conversation.findMany({
      where: { ...scope, unreadCount: { gt: 0 } },
      orderBy: { lastMessageAt: { sort: 'desc', nulls: 'last' } },
      take: 5,
      include: { contact: { select: { name: true, waId: true } }, channel: { select: { name: true } } },
    }),
    // Still answerable for free, but not for long: after this only a template goes through.
    prisma.conversation.findMany({
      where: { ...scope, windowExpiresAt: { gt: now, lt: new Date(now.getTime() + 3 * 3600_000) } },
      orderBy: { windowExpiresAt: 'asc' },
      take: 5,
      include: { contact: { select: { name: true, waId: true } } },
    }),
    prisma.message.findMany({
      where: { direction: Direction.IN, conversation: scope },
      orderBy: { createdAt: 'desc' },
      take: 6,
      include: { conversation: { include: { contact: { select: { name: true, waId: true } } } } },
    }),
    prisma.campaign.findMany({
      where: { orgId: user.orgId, ...(channelId ? { channelId } : {}), status: { not: CampaignStatus.DRAFT } },
      orderBy: { updatedAt: 'desc' },
      take: 3,
    }),
  ])

  return (
    <DashboardView
      overview={
        <DashboardOverview
          period={period}
          periods={PERIODS}
          data={overview}
          channel={channels.find((c) => c.id === channelId) ?? channels[0] ?? null}
        />
      }
      userName={me?.name ?? user.name}
      greeting={greeting(tz)}
      range={range}
      ranges={RANGES}
      channelId={channelId}
      channels={channels.map(({ id, name }) => ({ id, name }))}
      now={now}
      d={d}
      unreadList={unreadList}
      closingSoon={closingSoon}
      recentInbound={recentInbound}
      campaigns={campaigns}
    />
  )
}
