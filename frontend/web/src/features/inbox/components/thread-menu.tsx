'use client'

import { useRouter } from 'next/navigation'
import { Menu, MenuItem } from '@/components/ui/menu'

/** The "…" at the end of a conversation's header. */
export function ThreadMenu({ contactId }: { contactId: string }) {
  const router = useRouter()
  return (
    <Menu
      label="Lainnya"
      triggerClassName="flex size-10 shrink-0 items-center justify-center rounded-md text-fg-muted hover:bg-muted hover:text-fg"
      trigger={
        <svg
          width="25"
          height="25"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          aria-hidden
        >
          <circle cx="12" cy="12" r="0.6" />
          <circle cx="19" cy="12" r="0.6" />
          <circle cx="5" cy="12" r="0.6" />
        </svg>
      }
    >
      <MenuItem onSelect={() => router.push(`/contacts/${contactId}`)}>Profil kontak</MenuItem>
    </Menu>
  )
}
