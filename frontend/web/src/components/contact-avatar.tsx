import { cn } from '@/utils/cn'

// Two tints, as in the design; a contact keeps the same one everywhere.
const TONES = ['bg-ok-bg text-ok', 'bg-brand-bg text-brand'] as const

/** The contact's first letter on a soft tint picked from a stable seed. */
export function ContactAvatar({ seed, name, size = 40 }: { seed: string; name: string; size?: number }) {
  let h = 0
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) | 0
  const letter = name.trim().replace(/^\+/, '')[0]?.toUpperCase() ?? '?'

  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: size * 0.34 }}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-medium',
        TONES[Math.abs(h) % TONES.length],
      )}
    >
      {letter}
    </span>
  )
}
