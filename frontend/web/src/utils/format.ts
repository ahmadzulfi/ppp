export function initials(name: string | null | undefined, fallback: string) {
  const source = name?.trim() || fallback
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

/** "01:27" today, "Kemarin" yesterday, otherwise "20 Sep". */
export function shortTime(date: Date | null | undefined) {
  if (!date) return ''
  const now = new Date()
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
  }
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return 'Kemarin'
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
}

/** "6281234567890" → "+62 812-3456-7890"; other countries just get the plus. */
export function formatPhone(waId: string) {
  const d = waId.replace(/\D/g, '')
  if (!d.startsWith('62') || d.length < 9) return d ? `+${d}` : waId
  const rest = d.slice(2)
  return `+62 ${rest.slice(0, 3)}-${rest.slice(3, 7)}${rest.length > 7 ? `-${rest.slice(7)}` : ''}`
}
