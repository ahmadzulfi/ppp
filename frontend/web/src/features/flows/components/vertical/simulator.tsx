'use client'

import { useEffect, useRef, useState } from 'react'
import {
  ROUTE_QUESTION_VARIABLE,
  findFallbackTrigger,
  matchTrigger,
  nextNodeId,
  runFlow,
  type EngineEffects,
  type EngineInput,
  type FlowGraph,
  type NodeData,
  type SessionState,
} from '@wa/core/flow'
import { simulateAskAi, simulateRoute } from '@/features/flows/api/flow-editor-actions'
import { cn } from '@/utils/cn'
import { humanSeconds } from '../node-card'
import { NODE_REGISTRY } from './registry'

type Msg =
  | { from: 'user'; text: string }
  | { from: 'bot'; text: string; choices?: { id: string; title: string }[]; listButton?: string }
  | { from: 'note'; text: string }

const CONTEXT = {
  contact: { name: 'Warga Uji', waId: '6280000000000' },
  channel: { name: 'Simulator' },
}

/**
 * Runs the draft on the real engine, in the browser, against a pretend
 * contact. Messages are not sent; AI nodes call their real endpoint (so the
 * route the bot would take is the one shown), API calls are skipped.
 */
export function Simulator({
  flowId,
  graph,
  onPath,
  onPickNode,
  onClose,
}: {
  flowId: string | null
  graph: FlowGraph
  /** Nodes the current conversation has passed, in order. */
  onPath: (ids: string[]) => void
  onPickNode: (id: string) => void
  onClose: () => void
}) {
  const [messages, setMessages] = useState<Msg[]>([])
  const [session, setSession] = useState<SessionState | null>(null)
  const [path, setPath] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [text, setText] = useState('')
  const started = useRef(false)
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => {
    onPath(path)
  }, [path, onPath])
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  const label = (id: string) => {
    const kind = (graph.nodes.find((n) => n.id === id)?.data as NodeData | undefined)?.kind
    return kind ? NODE_REGISTRY[kind]?.label ?? kind : id
  }
  const parked = session?.currentNodeId ? graph.nodes.find((n) => n.id === session.currentNodeId) : undefined

  async function run(state: SessionState, input: EngineInput, out: Msg[], trail: string[]) {
    const fx: EngineEffects = {
      async sendText(body) {
        out.push({ from: 'bot', text: body })
      },
      async sendMedia(p) {
        out.push({ from: 'bot', text: `[${p.media}] ${p.caption ?? ''}\n${p.value}`.trim() })
      },
      async sendButtons(p) {
        out.push({ from: 'bot', text: [p.header, p.body, p.footer].filter(Boolean).join('\n\n'), choices: p.buttons })
      },
      async sendList(p) {
        out.push({
          from: 'bot',
          text: [p.header, p.body, p.footer].filter(Boolean).join('\n\n'),
          listButton: p.buttonText,
          choices: p.sections.flatMap((s) => s.rows.map((r) => ({ id: r.id, title: r.title }))),
        })
      },
      async sendTemplate(p) {
        out.push({ from: 'bot', text: `[template ${p.name} (${p.language})] ${p.bodyParams.join(' · ')}` })
      },
      async httpRequest(p) {
        out.push({ from: 'note', text: `Panggil API ${p.method} ${p.url} dilewati di simulator (dianggap berhasil).` })
        return { status: 200, data: {} }
      },
      async askAi({ endpointId, question }) {
        const res = await simulateAskAi(endpointId, question)
        if (!res.ok) throw new Error(res.error)
        return { answer: res.answer }
      },
      async routeAi({ endpointId, question, destinations }) {
        const res = await simulateRoute(flowId, endpointId, question, destinations)
        if (!res.ok) throw new Error(res.error)
        const dest = destinations.find((d) => d.id === res.pick.destinationId)
        out.push({
          from: 'note',
          text: `Arahkan AI: ${dest ? `"${dest.path}"` : 'tidak ada menu yang cocok'} (skor ${res.pick.score.toFixed(2)})`,
        })
        return res.pick
      },
      async recordRoute() {
        return null
      },
      async settleRoute() {},
      async changeTags(action, tags) {
        out.push({ from: 'note', text: `${action === 'add' ? 'Tambah' : 'Hapus'} tag: ${tags.join(', ')}` })
      },
      async assign(userId) {
        out.push({ from: 'note', text: userId ? 'Ditugaskan ke agen tertentu.' : 'Ditugaskan otomatis.' })
      },
      async handover() {
        out.push({ from: 'note', text: 'Percakapan diserahkan ke petugas.' })
      },
      trace(nodeId) {
        trail.push(nodeId)
      },
    }

    let current = state
    let next: EngineInput | null = input
    while (next) {
      const { state: after, outcome } = await runFlow(graph, current, next, { ...CONTEXT, variables: current.variables }, fx)
      current = after
      next = null
      switch (outcome.status) {
        case 'sleeping':
          // A real delay would park the session; here it just passes.
          out.push({ from: 'note', text: `${humanSeconds(outcome.seconds)} (dilewati di simulator)` })
          next = { kind: 'resume' }
          break
        case 'waiting':
          return current
        case 'completed':
          out.push({ from: 'note', text: 'Alur selesai.' })
          return null
        case 'handedOver':
          out.push({ from: 'note', text: 'Bot berhenti, petugas yang melanjutkan.' })
          return null
        case 'expired':
          out.push({ from: 'note', text: 'Sesi kedaluwarsa.' })
          return null
        case 'failed':
          out.push({ from: 'note', text: `Alur gagal: ${outcome.error}` })
          return null
      }
    }
    return null
  }

  async function send(input: { text?: string; replyId?: string; timeout?: boolean }) {
    if (busy) return
    setBusy(true)
    const out: Msg[] = []
    const trail: string[] = []
    if (input.text) out.push({ from: 'user', text: input.text })
    if (input.timeout) out.push({ from: 'note', text: 'Warga tidak membalas.' })

    try {
      let after: SessionState | null
      if (session) {
        after = await run(
          session,
          input.timeout
            ? { kind: 'timeout' }
            : { kind: 'reply', messageType: input.replyId ? 'interactive' : 'text', text: input.text, replyId: input.replyId },
          out,
          trail,
        )
      } else {
        const signal = { text: input.text, replyId: input.replyId, isNewConversation: !started.current }
        started.current = true
        const trigger = matchTrigger(graph, signal)?.node ?? (input.text ? findFallbackTrigger(graph) : null)
        const first = trigger ? nextNodeId(graph, trigger.id, null) : null
        if (!trigger) {
          out.push({ from: 'note', text: 'Tidak ada Trigger yang cocok dengan pesan ini, bot diam.' })
          after = null
        } else if (!first) {
          trail.push(trigger.id)
          out.push({ from: 'note', text: 'Trigger cocok tapi belum tersambung ke node lain.' })
          after = null
        } else {
          trail.push(trigger.id)
          const state: SessionState = {
            currentNodeId: trigger.id,
            variables: input.text ? { [ROUTE_QUESTION_VARIABLE]: input.text } : {},
            stepCount: 0,
            retries: 0,
          }
          after = await run(state, { kind: 'start', startNodeId: first }, out, trail)
        }
      }
      setSession(after)
    } catch (err) {
      out.push({ from: 'note', text: `Simulator error: ${err instanceof Error ? err.message : String(err)}` })
      setSession(null)
    }
    setMessages((m) => [...m, ...out])
    setPath((p) => [...p, ...trail])
    setBusy(false)
  }

  function reset() {
    setMessages([])
    setSession(null)
    setPath([])
    started.current = false
  }

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l bg-surface">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b px-3">
        <span className="text-[13px] font-medium text-fg">Simulator</span>
        <button onClick={reset} className="ml-auto text-[11px] text-accent hover:underline">
          Mulai ulang
        </button>
        <button onClick={onClose} className="text-[11px] text-fg-muted hover:underline">
          Tutup
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-muted/40 p-3">
        {messages.length === 0 && (
          <p className="text-[11px] text-fg-muted">
            Ketik pesan seperti warga, misalnya kata kunci trigger. Pesan tidak benar-benar dikirim. Node AI memanggil AI
            sungguhan; Panggil API dilewati.
          </p>
        )}
        <div className="space-y-2">
          {messages.map((m, i) =>
            m.from === 'note' ? (
              <p key={i} className="text-center text-[10px] text-fg-muted italic">
                {m.text}
              </p>
            ) : (
              <div key={i} className={cn('flex', m.from === 'user' ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'max-w-[85%] rounded-lg px-2.5 py-1.5 text-[12px] whitespace-pre-wrap shadow-xs',
                    m.from === 'user' ? 'bg-accent text-on-accent' : 'border bg-surface text-fg',
                  )}
                >
                  {m.text}
                  {m.from === 'bot' && m.choices && (
                    <div className="mt-1.5 space-y-1 border-t pt-1.5">
                      {m.listButton && <div className="text-[10px] text-fg-muted">{m.listButton}:</div>}
                      {m.choices.map((c) => (
                        <button
                          key={c.id}
                          disabled={busy || i !== lastBot(messages)}
                          onClick={() => send({ text: c.title, replyId: c.id })}
                          className="block w-full rounded-md border px-2 py-1 text-center text-[12px] text-accent hover:bg-muted disabled:opacity-50"
                        >
                          {c.title}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ),
          )}
        </div>
        <div ref={bottom} />
      </div>

      {path.length > 0 && (
        <div className="max-h-28 shrink-0 overflow-y-auto border-t px-3 py-1.5">
          <div className="text-[10px] text-fg-muted">Jalur yang dilewati</div>
          <div className="flex flex-wrap gap-1 pt-1">
            {path.map((id, i) => (
              <button
                key={i}
                onClick={() => onPickNode(id)}
                className="rounded border px-1.5 py-px text-[10px] text-fg hover:bg-muted"
              >
                {i + 1}. {label(id)}
              </button>
            ))}
          </div>
        </div>
      )}

      <form
        className="flex shrink-0 gap-1.5 border-t p-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!text.trim()) return
          void send({ text: text.trim() })
          setText('')
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={busy ? 'Menunggu bot…' : 'Ketik pesan warga…'}
          className="h-8 min-w-0 flex-1 rounded-md border bg-surface px-2 text-[12px] text-fg outline-none focus:border-accent"
        />
        <button disabled={busy} className="h-8 rounded-md bg-fg px-2.5 text-[12px] text-on-fg disabled:opacity-40">
          Kirim
        </button>
      </form>
      {parked && (parked.data as NodeData).kind === 'waitReply' && (
        <button
          disabled={busy}
          onClick={() => send({ timeout: true })}
          className="mx-2 mb-2 rounded-md border px-2 py-1 text-[11px] text-fg-muted hover:bg-muted"
        >
          Anggap warga tidak membalas
        </button>
      )}
    </aside>
  )
}

function lastBot(messages: Msg[]) {
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i]!.from === 'bot') return i
  return -1
}
