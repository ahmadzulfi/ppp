import { notFound } from 'next/navigation'
import { prisma } from '@wa/db'
import { hasRole, requireUser } from '@/lib/auth'
import { WindowBadge, windowState } from '@/components/window-badge'
import { MessageBubble } from '@/components/message-bubble'
import { MessageThread } from '@/components/message-thread'
import { Composer } from '@/components/composer'
import { BotToggle } from '@/components/bot-toggle'
import { EndSession } from '@/components/end-session'
import { MarkRead } from '@/components/mark-read'
import { LabelPicker } from '@/components/labels/label-picker'

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

  return (
    <div className="flex h-full flex-col">
      <MarkRead conversationId={conversation.id} unreadCount={conversation.unreadCount} />

      <header className="flex h-14 shrink-0 items-center justify-between border-b bg-surface px-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm text-fg">
              {conversation.contact.name || conversation.contact.waId}
            </span>
            <WindowBadge expiresAt={conversation.windowExpiresAt} />
            {conversation.status === 'CLOSED' && (
              <span className="shrink-0 rounded bg-muted px-1.5 py-px text-[10px] text-fg-muted">selesai</span>
            )}
          </div>
          <div className="mt-0.5 truncate text-[11px] text-fg-muted">
            <span className="font-mono">{conversation.contact.waId}</span> ·{' '}
            {conversation.channel.name}
            {conversation.assignee && <> · ditangani {conversation.assignee.name}</>}
          </div>
        </div>

        <div className="flex min-w-0 shrink items-center gap-2 pl-3">
          <LabelPicker
            conversationId={conversation.id}
            labels={labels}
            selected={conversation.labels.map((l) => l.labelId)}
            readOnly={user.role === 'VIEWER'}
            canManage={hasRole(user, 'SUPERVISOR')}
          />
          {user.role !== 'VIEWER' && (
            <EndSession conversationId={conversation.id} closed={conversation.status === 'CLOSED'} />
          )}
          <BotToggle conversationId={conversation.id} paused={conversation.botPaused} />
        </div>
      </header>

      <MessageThread
        key={conversation.id}
        shown={shown}
        nextShown={hasOlder ? Math.min(shown + THREAD_PAGE, THREAD_MAX) : null}
        firstMessageId={messages[0]?.id ?? null}
        lastMessageId={messages.at(-1)?.id ?? null}
      >
        {messages.length === 0 && (
          <p className="pt-8 text-center text-xs text-fg-muted">Belum ada pesan.</p>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
      </MessageThread>

      <Composer
        conversationId={conversation.id}
        windowOpen={state.open}
        readOnly={user.role === 'VIEWER'}
        channelPaused={conversation.channel.sendingPaused}
        templates={templates}
      />
    </div>
  )
}
