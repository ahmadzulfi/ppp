'use client'

import { useRouter } from 'next/navigation'
import { Menu, MenuItem, MenuSeparator } from '@/components/ui/menu'
import { ThemeToggle } from '@/components/theme-toggle'

/**
 * The signed-in user at the right of the header. Profile, theme and sign-out
 * live in its menu so the header itself stays as quiet as the design.
 */
export function AccountMenu({
  name,
  role,
  initials,
  signOut,
}: {
  name: string
  role: string
  initials: string
  signOut: () => Promise<void>
}) {
  const router = useRouter()

  return (
    <Menu
      label="Akun"
      triggerClassName="flex items-center gap-2.5 rounded-lg py-1 pr-1 pl-1 text-left hover:bg-muted"
      panelClassName="min-w-52"
      trigger={
        <>
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-bg text-[13px] font-semibold text-heading">
            {initials}
          </span>
          <span className="hidden leading-tight sm:block">
            <span className="block text-[13px] font-medium text-heading">{name}</span>
            <span className="block text-[11px] text-fg-muted">{role}</span>
          </span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="text-fg-muted">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </>
      }
    >
      <MenuItem onSelect={() => router.push('/profile')}>Profil saya</MenuItem>
      <MenuSeparator />
      <div className="flex items-center justify-between gap-3 px-2.5 py-1.5 text-[12px] text-fg">
        Tema
        <ThemeToggle />
      </div>
      <MenuSeparator />
      <MenuItem danger onSelect={() => void signOut()}>
        Keluar
      </MenuItem>
    </Menu>
  )
}
