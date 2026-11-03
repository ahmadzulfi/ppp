'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { sendReply, type SendState } from '@/features/inbox/api/messages-actions'
import { WA_LIMITS } from '@wa/core/limits'
import { TemplatePicker, type InboxTemplate, type SyncTemplates } from './template-picker'

export function Composer({
  conversationId,
  windowOpen,
  readOnly,
  channelPaused,
  templates,
  syncTemplates,
}: {
  conversationId: string
  windowOpen: boolean
  readOnly: boolean
  channelPaused: boolean
  templates: InboxTemplate[]
  syncTemplates: SyncTemplates
}) {
  const [state, action] = useActionState<SendState, FormData>(sendReply, {})
  const formRef = useRef<HTMLFormElement>(null)
  const [templateMode, setTemplateMode] = useState(false)

  const blocked = readOnly
    ? 'Peran kamu hanya bisa membaca.'
    : channelPaused
      ? 'Pengiriman dari nomor ini sedang dijeda.'
      : null

  if (blocked) {
    return (
      <div className="shrink-0 rounded-[5px] bg-surface p-3">
        <p className="rounded-md bg-muted px-3 py-2 text-xs text-fg-muted">{blocked}</p>
      </div>
    )
  }

  // Past the window a template is the only way to reach the contact, so the
  // picker replaces the text field instead of hiding behind a button.
  if (!windowOpen) {
    return (
      <div className="max-h-[50vh] shrink-0 space-y-2 overflow-y-auto rounded-[5px] bg-surface p-3">
        <p className="text-[11px] text-fg-muted">
          Window 24 jam tertutup — hanya template yang disetujui bisa dikirim. Window terbuka lagi setelah kontak
          membalas.
        </p>
        <TemplatePicker conversationId={conversationId} templates={templates} syncTemplates={syncTemplates} />
      </div>
    )
  }

  if (templateMode) {
    return (
      <div className="max-h-[50vh] shrink-0 overflow-y-auto rounded-[5px] bg-surface p-3">
        <TemplatePicker
          conversationId={conversationId}
          templates={templates}
          syncTemplates={syncTemplates}
          onSent={() => setTemplateMode(false)}
          onCancel={() => setTemplateMode(false)}
        />
      </div>
    )
  }

  return (
    <form ref={formRef} action={action} className="shrink-0 rounded-[5px] bg-surface px-6 pt-4 pb-1.5">
      <input type="hidden" name="conversationId" value={conversationId} />
      <Field formRef={formRef} onTemplate={() => setTemplateMode(true)} />
      {state.error && <p className="mt-1.5 text-xs text-danger">{state.error}</p>}
    </form>
  )
}

function Field({ formRef, onTemplate }: { formRef: React.RefObject<HTMLFormElement | null>; onTemplate: () => void }) {
  const { pending } = useFormStatus()
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!pending) {
      if (ref.current) ref.current.value = ''
      ref.current?.focus()
    }
  }, [pending])

  return (
    <>
      <div className="flex items-end gap-5">
        <div className="flex min-w-0 flex-1 rounded-md border px-3 py-2.5 focus-within:border-accent">
          <textarea
            ref={ref}
            name="body"
            rows={1}
            maxLength={WA_LIMITS.text.bodyMax}
            disabled={pending}
            placeholder="Kirim Pesan"
            aria-label="Pesan"
            className="max-h-32 min-h-5 flex-1 resize-none bg-transparent text-xs leading-5 text-fg outline-none placeholder:text-fg-muted disabled:opacity-50"
            onInput={(e) => {
              const el = e.currentTarget
              el.style.height = 'auto'
              el.style.height = `${Math.min(el.scrollHeight, 128)}px`
            }}
            onKeyDown={(e) => {
              // Enter sends, Shift+Enter breaks the line - the convention every
              // chat tool uses, and agents type fast enough to notice its absence.
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                if (e.currentTarget.value.trim()) formRef.current?.requestSubmit()
              }
            }}
          />
        </div>
        <button
          disabled={pending}
          className="mb-0.5 flex h-[38px] shrink-0 items-center gap-2 rounded-md bg-navy-700 px-4 text-xs font-medium text-white hover:bg-navy-800 disabled:opacity-50"
        >
          {pending ? 'Mengirim…' : 'Kirim'}
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M14.5 21.7a.5.5 0 0 0 .9 0L22 2.6a.5.5 0 0 0-.6-.6L2.3 8.6a.5.5 0 0 0 0 .9l8 3.2a2 2 0 0 1 1.1 1.1ZM21.9 2.1 10.9 13.1" />
          </svg>
        </button>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={onTemplate}
          title="Kirim template yang disetujui Meta"
          className="flex h-8 items-center gap-1.5 rounded-md px-2 text-[11px] text-fg-muted hover:bg-muted hover:text-fg disabled:opacity-40"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 19 19"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            aria-hidden
          >
            <path d="M2.375 7.125H16.625M7.125 7.125V16.625M3.95833 2.375H15.0417C15.9161 2.375 16.625 3.08388 16.625 3.95833V15.0417C16.625 15.9161 15.9161 16.625 15.0417 16.625H3.95833C3.08388 16.625 2.375 15.9161 2.375 15.0417V3.95833C2.375 3.08388 3.08388 2.375 3.95833 2.375Z" />
          </svg>
          Template
        </button>
        <span className="text-[10px] text-fg-muted">Enter untuk kirim · Shift + Enter baris baru</span>
      </div>
    </>
  )
}
