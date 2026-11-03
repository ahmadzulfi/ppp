import { notFound } from 'next/navigation'
import { prisma } from '@wa/db'
import { hasRole, requireUser } from '@/lib/auth'
import { WindowBadge, windowState } from '@/features/inbox/components/window-badge'
import { MessageBubble } from '@/features/inbox/components/message-bubble'
import { MessageThread } from '@/features/inbox/components/message-thread'
import { Composer } from '@/features/inbox/components/composer'
import { BotToggle } from '@/features/inbox/components/bot-toggle'
import { EndSession } from '@/features/inbox/components/end-session'
import { MarkRead } from '@/features/inbox/components/mark-read'
import { LabelPicker } from '@/features/labels/components/label-picker'
import { syncTemplates } from '@/features/templates/api/templates-actions'
import { ContactAvatar } from '@/components/contact-avatar'
import { ThreadMenu } from '@/features/inbox/components/thread-menu'
import { formatPhone } from '@/utils/format'

export const dynamic = 'force-dynamic'

const THREAD_PAGE = 200
const THREAD_MAX = 5_000

export default async function ThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tampil?: string }>
}) {
  const user = await requireUser()
  const { id } = await params
  // How many of the newest messages to show. "Muat pesan sebelumnya" raises
  // it in the URL, so the periodic refresh keeps the history it loaded.
  const asked = Number((await searchParams).tampil)
  const shown = Number.isInteger(asked) ? Math.min(Math.max(asked, THREAD_PAGE), THREAD_MAX) : THREAD_PAGE

  const conversation = await prisma.conversation.findUnique({
    where: { id },
    include: {
      contact: true,
      channel: { select: { orgId: true, name: true, sendingPaused: true, wabaId: true } },
      assignee: { select: { name: true } },
      labels: { select: { labelId: true }, orderBy: { createdAt: 'asc' } },
      // The newest page, flipped back to reading order below. Ascending with a
      // take would freeze the thread on its first messages. One extra row
      // tells whether there is older history to offer.
      messages: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: shown + 1 },
    },
  })

  if (!conversation || conversation.channel.orgId !== user.orgId) notFound()

  const state = windowState(conversation.windowExpiresAt)
  const hasOlder = conversation.messages.length > shown && shown < THREAD_MAX
  const messages = conversation.messages.slice(0, shown).reverse()

  // Templates live on the WABA, so any number under it can send them.
  // Authentication templates carry one-time codes an agent should never type.
  const templates = conversation.channel.wabaId
    ? await prisma.template.findMany({
        where: {
          wabaId: conversation.channel.wabaId,
          metaStatus: 'APPROVED',
          category: { not: 'AUTHENTICATION' },
        },
        orderBy: [{ name: 'asc' }, { language: 'asc' }],
        select: { id: true, name: true, language: true, category: true, components: true },
      })
    : []

  const labels = await prisma.label.findMany({
    where: { orgId: user.orgId },
    select: { id: true, name: true, color: true },
    orderBy: { name: 'asc' },
  })

  const contactName = conversation.contact.name || formatPhone(conversation.contact.waId)
  const tz = 'Asia/Jakarta'
  const dayOf = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: tz })
  const today = dayOf(new Date())
  const yesterday = dayOf(new Date(Date.now() - 86_400_000))
  const dayLabel = (d: Date) => {
    const full = d.toLocaleDateString('id-ID', { timeZone: tz, day: 'numeric', month: 'long', year: 'numeric' })
    const k = dayOf(d)
    return k === today ? `Hari ini, ${full}` : k === yesterday ? `Kemarin, ${full}` : full
  }

  return (
    <div className="flex h-full flex-col gap-2 p-2">
      <MarkRead conversationId={conversation.id} unreadCount={conversation.unreadCount} />

      <header className="flex min-h-[95px] shrink-0 items-center justify-between gap-3 rounded-[5px] bg-surface px-6 py-3">
        <div className="flex min-w-0 items-center gap-4">
          <ContactAvatar seed={conversation.id} name={contactName} size={50} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-lg font-semibold text-fg">{contactName}</span>
              <WindowBadge expiresAt={conversation.windowExpiresAt} />
              {conversation.status === 'CLOSED' && (
                <span className="shrink-0 rounded bg-muted px-1.5 py-px text-[10px] text-fg-muted">selesai</span>
              )}
            </div>
            <div className="truncate text-[13px] text-fg-muted">
              {formatPhone(conversation.contact.waId)} · {conversation.channel.name}
              {conversation.assignee && <> · ditangani {conversation.assignee.name}</>}
            </div>
          </div>
        </div>

        <div className="flex min-w-0 shrink items-center gap-2">
          <LabelPicker
            conversationId={conversation.id}
            labels={labels}
            selected={conversation.labels.map((l) => l.labelId)}
            readOnly={user.role === 'VIEWER'}
            canManage={hasRole(user, 'SUPERVISOR')}
          />
          <BotToggle conversationId={conversation.id} paused={conversation.botPaused} />
          {user.role !== 'VIEWER' && (
            <EndSession conversationId={conversation.id} closed={conversation.status === 'CLOSED'} />
          )}
          <ThreadMenu contactId={conversation.contactId} />
        </div>
      </header>

      <MessageThread
        key={conversation.id}
        shown={shown}
        nextShown={hasOlder ? Math.min(shown + THREAD_PAGE, THREAD_MAX) : null}
        firstMessageId={messages[0]?.id ?? null}
        lastMessageId={messages.at(-1)?.id ?? null}
      >
        {messages.length === 0 && <p className="pt-8 text-center text-xs text-fg-muted">Belum ada pesan.</p>}
        {messages.map((m, i) => (
          <div key={m.id}>
            {(i === 0 ? !hasOlder : dayOf(messages[i - 1]!.createdAt) !== dayOf(m.createdAt)) && (
              <p className="py-2 text-center text-[15px] text-fg-muted">{dayLabel(m.createdAt)}</p>
            )}
            <MessageBubble message={m} />
          </div>
        ))}
      </MessageThread>

      <Composer
        conversationId={conversation.id}
        windowOpen={state.open}
        readOnly={user.role === 'VIEWER'}
        channelPaused={conversation.channel.sendingPaused}
        templates={templates}
        syncTemplates={syncTemplates}
      />
    </div>
  )
}
