'use client'

import { type FlowNode } from '@wa/core/flow'
import { useAiEndpoints } from './ai-context'

/**
 * What a node says, in a line or three - the body of a node card on the
 * canvas and of a step in the simulator.
 */
export function Summary({ data }: { data: FlowNode['data'] }) {
  const text = (s: string) => (
    <p className="line-clamp-3 text-[12px] whitespace-pre-wrap text-fg">{s}</p>
  )
  const muted = (s: string) => <p className="text-[12px] text-fg-muted italic">{s}</p>

  switch (data.kind) {
    case 'trigger': {
      const values = data.values.filter(Boolean)
      if (data.match === 'newConversation') return muted('Percakapan baru')
      if (data.match === 'api') return muted('Dipicu lewat API')
      if (data.match === 'fallback') return muted('Pesan yang tidak cocok kata kunci apa pun')
      return values.length ? text(values.join(', ')) : muted('Belum ada kata kunci')
    }
    case 'sendText':
      return data.body ? text(data.body) : muted('Pesan kosong')
    case 'sendMedia':
      return data.value
        ? text(`${data.media}${data.caption ? ` — ${data.caption}` : ''}`)
        : muted(`${data.media}: belum ada sumber`)
    case 'sendButtons':
      return data.body ? text(data.body) : muted('Pesan kosong')
    case 'sendList':
      return data.body ? text(data.body) : muted('Pesan kosong')
    case 'sendTemplate':
      return data.templateName
        ? text(`${data.templateName} (${data.language})`)
        : muted('Template belum dipilih')
    case 'waitReply':
      return text(`Simpan ke {{${data.saveAs}}}`)
    case 'condition':
      return text(`{{${data.variable}}} ${OPERATORS[data.operator]} ${data.value}`)
    case 'setVariable':
      return text(`{{${data.name}}} = ${data.value}`)
    case 'httpRequest':
      return data.url
        ? text(`${data.method} ${data.url}\n→ {{${data.saveAs}}}`)
        : muted('URL belum diisi')
    case 'askAi':
      return <AskAiSummary data={data} />
    case 'aiRoute':
      return <AiRouteSummary data={data} />

    case 'delay':
      return text(humanSeconds(data.seconds))
    case 'assign':
      return muted(data.userId ? 'Tugaskan ke agen' : 'Tugaskan otomatis')
    case 'tag':
      return text(`${data.action === 'add' ? '+' : '−'} ${data.tags.join(', ')}`)
    case 'handover':
      return muted('Jeda bot, serahkan ke agen')
    case 'end':
      return muted(data.reason || 'Selesai')
  }
}

function AskAiSummary({ data }: { data: Extract<FlowNode['data'], { kind: 'askAi' }> }) {
  const ai = useAiEndpoints().find((a) => a.id === data.endpointId)
  return (
    <div className="space-y-0.5 text-[12px]">
      <p className={ai ? 'text-fg' : 'text-fg-muted italic'}>
        {ai ? ai.name : data.endpointId ? 'AI sudah dihapus' : 'AI belum dipilih'}
      </p>
      <p className="text-fg-muted">
        Tanya {`{{${data.question}}}`}
        {data.sendAnswer
          ? data.endButton.trim()
            ? `, jawaban dikirim + tombol "${data.endButton.trim()}"`
            : ', jawaban langsung dikirim'
          : `, simpan ke {{${data.saveAs}}}`}
      </p>
    </div>
  )
}

function AiRouteSummary({ data }: { data: Extract<FlowNode['data'], { kind: 'aiRoute' }> }) {
  const ai = useAiEndpoints().find((a) => a.id === data.endpointId)
  return (
    <div className="space-y-0.5 text-[12px]">
      <p className={ai ? 'text-fg' : 'text-fg-muted italic'}>
        {ai ? ai.name : data.endpointId ? 'AI sudah dihapus' : 'AI belum dipilih'}
      </p>
      <p className="text-fg-muted">
        Arahkan {`{{${data.question}}}`} ke menu, skor minimal{' '}
        {data.minScore.toLocaleString('id-ID', { maximumFractionDigits: 2 })}
        {data.clarify ? ', ragu → tanya balik' : ''}
      </p>
    </div>
  )
}

const OPERATORS: Record<string, string> = {
  eq: '=',
  neq: '≠',
  contains: 'memuat',
  startsWith: 'diawali',
  gt: '>',
  lt: '<',
  isSet: 'terisi',
  isEmpty: 'kosong',
}

export function humanSeconds(s: number) {
  if (s % 3600 === 0) return `Jeda ${s / 3600} jam`
  if (s % 60 === 0) return `Jeda ${s / 60} menit`
  return `Jeda ${s} detik`
}
