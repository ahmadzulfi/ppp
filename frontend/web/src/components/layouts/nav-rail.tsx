'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/utils/cn'

const ITEMS: { href: string; label: string; title?: string; icon: () => React.JSX.Element }[] = [
  { href: '/', label: 'Dashboard', icon: IconDashboard },
  { href: '/inbox', label: 'Inbox', icon: IconInbox },
  { href: '/broadcast', label: 'Broadcast', icon: IconMegaphone },
  { href: '/contacts', label: 'Kontak', icon: IconUser },
  { href: '/templates', label: 'Template', icon: IconTemplate },
  { href: '/flows', label: 'Otomasi', icon: IconWorkflow },
  { href: '/ai', label: 'AI', icon: IconAi },
  { href: '/knowledge', label: 'Pengetahuan', title: 'Basis Pengetahuan', icon: IconBook },
  { href: '/channels', label: 'Nomor', icon: IconPhone },
  { href: '/settings', label: 'Setting', title: 'Pengaturan', icon: IconSettings },
]

export function NavRail() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Menu utama"
      className="flex w-[72px] shrink-0 flex-col gap-1 overflow-y-auto bg-rail px-1 pt-3 pb-3 [scrollbar-width:none]"
    >
      {ITEMS.map(({ href, label, title, icon: Icon }) => {
        // Every path starts with '/', so home only counts on an exact match.
        const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            title={title ?? label}
            className={cn(
              'flex h-14 w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-[10px] transition-colors',
              active
                ? 'bg-rail-active text-rail-active-fg'
                : 'text-rail-fg hover:bg-rail-hover hover:text-rail-active-fg',
            )}
          >
            <Icon />
            <span className="text-[10px] leading-none font-medium">{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

// Lucide outlines on a 19-unit grid, as drawn in the design.
const svg = {
  width: 19,
  height: 19,
  viewBox: '0 0 19 19',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

function IconDashboard() {
  return (
    <svg {...svg}>
      <path d="M3.16667 2.375H7.125C7.56223 2.375 7.91667 2.72944 7.91667 3.16667V8.70833C7.91667 9.14556 7.56223 9.5 7.125 9.5H3.16667C2.72944 9.5 2.375 9.14556 2.375 8.70833V3.16667C2.375 2.72944 2.72944 2.375 3.16667 2.375ZM11.875 2.375H15.8333C16.2706 2.375 16.625 2.72944 16.625 3.16667V5.54167C16.625 5.97889 16.2706 6.33333 15.8333 6.33333H11.875C11.4378 6.33333 11.0833 5.97889 11.0833 5.54167V3.16667C11.0833 2.72944 11.4378 2.375 11.875 2.375ZM11.875 9.5H15.8333C16.2706 9.5 16.625 9.85444 16.625 10.2917V15.8333C16.625 16.2706 16.2706 16.625 15.8333 16.625H11.875C11.4378 16.625 11.0833 16.2706 11.0833 15.8333V10.2917C11.0833 9.85444 11.4378 9.5 11.875 9.5ZM3.16667 12.6667H7.125C7.56223 12.6667 7.91667 13.0211 7.91667 13.4583V15.8333C7.91667 16.2706 7.56223 16.625 7.125 16.625H3.16667C2.72944 16.625 2.375 16.2706 2.375 15.8333V13.4583C2.375 13.0211 2.72944 12.6667 3.16667 12.6667Z" />
    </svg>
  )
}

function IconInbox() {
  return (
    <svg {...svg}>
      <path d="M17.4173 9.5H12.6669L11.0835 11.8748H7.91654L6.33308 9.5H1.5827M1.5827 9.5L4.31417 4.04596C4.44526 3.7822 4.64735 3.56022 4.89771 3.405C5.14807 3.24977 5.43678 3.16746 5.73137 3.1673H13.2686C13.5632 3.16746 13.8519 3.24977 14.1023 3.405C14.3527 3.56022 14.5547 3.7822 14.6858 4.04596L17.4173 9.5V14.2495C17.4173 14.6694 17.2505 15.0721 16.9535 15.369C16.6566 15.6659 16.2538 15.8327 15.8338 15.8327H3.16616C2.7462 15.8327 2.34344 15.6659 2.04648 15.369C1.74953 15.0721 1.5827 14.6694 1.5827 14.2495V9.5Z" />
    </svg>
  )
}

function IconMegaphone() {
  return (
    <svg {...svg}>
      <path d="M4.75 11.0833C4.75 13.1389 5.41669 15.1389 6.65 16.7833C6.90196 17.1193 7.27704 17.3414 7.69275 17.4008C8.10846 17.4601 8.53073 17.352 8.86667 17.1C9.20261 16.848 9.4247 16.473 9.48409 16.0573C9.54347 15.6415 9.43529 15.2193 9.18333 14.8833C8.36113 13.7871 7.91667 12.4537 7.91667 11.0833M4.75 11.0833H6.33333M7.91667 11.0833H8.70833C11.1161 11.0213 13.4693 11.8057 15.3583 13.3C15.476 13.3882 15.6158 13.4419 15.7622 13.4551C15.9087 13.4683 16.0559 13.4405 16.1874 13.3748C16.3189 13.309 16.4295 13.2079 16.5068 13.0829C16.5841 12.9578 16.625 12.8137 16.625 12.6667V3.16667C16.625 3.01965 16.5841 2.87553 16.5068 2.75046C16.4295 2.6254 16.3189 2.52433 16.1874 2.45858C16.0559 2.39283 15.9087 2.365 15.7622 2.3782C15.6158 2.3914 15.476 2.44512 15.3583 2.53333C13.4693 4.02761 11.1161 4.81202 8.70833 4.75L6.33333 4.75L3.95833 4.75C3.53841 4.75 3.13568 4.91682 2.83875 5.21375C2.54181 5.51068 2.375 5.91341 2.375 6.33333V9.5C2.375 9.91993 2.54181 10.3227 2.83875 10.6196C3.13568 10.9165 3.53841 11.0833 3.95833 11.0833H4.75M7.91667 11.0833H6.33333M6.33333 4.75V11.0833" />
    </svg>
  )
}

function IconUser() {
  return (
    <svg {...svg}>
      <path d="M9.5 10.2917C11.6859 10.2917 13.4579 8.51946 13.4579 6.33333C13.4579 4.14721 11.6859 2.375 9.5 2.375C7.31409 2.375 5.54206 4.14721 5.54206 6.33333C5.54206 8.51946 7.31409 10.2917 9.5 10.2917ZM9.5 10.2917C11.1795 10.2917 12.7903 10.9589 13.9779 12.1467C15.1655 13.3344 15.8327 14.9453 15.8327 16.625M9.5 10.2917C7.82046 10.2917 6.20972 10.9589 5.02211 12.1467C3.83449 13.3344 3.1673 14.9453 3.1673 16.625" />
    </svg>
  )
}

function IconTemplate() {
  return (
    <svg {...svg}>
      <path d="M2.375 7.125H7.125M2.375 7.125V15.0417C2.375 15.9161 3.08388 16.625 3.95833 16.625H7.125M2.375 7.125V3.95833C2.375 3.08388 3.08388 2.375 3.95833 2.375H15.0417C15.9161 2.375 16.625 3.08388 16.625 3.95833V7.125M7.125 7.125H16.625M7.125 7.125V16.625M16.625 7.125V15.0417C16.625 15.9161 15.9161 16.625 15.0417 16.625H7.125" />
    </svg>
  )
}

function IconWorkflow() {
  return (
    <svg {...svg}>
      <path d="M5.54167 8.70833V11.875C5.54167 12.2949 5.70848 12.6977 6.00541 12.9946C6.30235 13.2915 6.70507 13.4583 7.125 13.4583H10.2917M5.54167 8.70833H7.125C7.99945 8.70833 8.70833 7.99945 8.70833 7.125V3.95833C8.70833 3.08388 7.99945 2.375 7.125 2.375H3.95833C3.08388 2.375 2.375 3.08388 2.375 3.95833V7.125C2.375 7.99945 3.08388 8.70833 3.95833 8.70833H5.54167ZM10.2917 13.4583V15.0417C10.2917 15.9161 11.0005 16.625 11.875 16.625H15.0417C15.9161 16.625 16.625 15.9161 16.625 15.0417V11.875C16.625 11.0005 15.9161 10.2917 15.0417 10.2917H11.875C11.0005 10.2917 10.2917 11.0005 10.2917 11.875V13.4583Z" />
    </svg>
  )
}

// The design's "Setting" item wears a sun.
function IconSettings() {
  return (
    <svg {...svg}>
      <path d="M9.5 1.5827V3.16616M9.5 15.8338V17.4173M3.90222 3.90222L5.01856 5.01856M13.9813 13.9813L15.0977 15.0977M1.5827 9.5H3.16616M15.8338 9.5H17.4173M5.01856 13.9813L3.90222 15.0977M15.0977 3.90222L13.9813 5.01856M12.6669 9.5C12.6669 11.249 11.249 12.6669 9.5 12.6669C7.75096 12.6669 6.33308 11.249 6.33308 9.5C6.33308 7.75096 7.75096 6.33308 9.5 6.33308C11.249 6.33308 12.6669 7.75096 12.6669 9.5Z" />
    </svg>
  )
}

// Not in the design; drawn on the same grid and stroke to sit with the rest.
function IconAi() {
  return (
    <svg {...svg}>
      <path d="M9.5 2.8 11 7.2l4.4 1.5L11 10.2 9.5 14.7 8 10.2 3.6 8.7 8 7.2 9.5 2.8Z" />
      <path d="M14.7 13.1l.4 1.2 1.2.4-1.2.4-.4 1.2-.4-1.2-1.2-.4 1.2-.4.4-1.2Z" />
    </svg>
  )
}

function IconBook() {
  return (
    <svg {...svg}>
      <path d="M4 15V4.4A1.6 1.6 0 0 1 5.6 2.8H15v10.3H5.6A1.6 1.6 0 0 0 4 14.7Zm0 0a1.6 1.6 0 0 0 1.6 1.6H15v-3.5" />
      <path d="M7.2 6.3h4.7M7.2 9.1h3.2" />
    </svg>
  )
}

function IconPhone() {
  return (
    <svg {...svg}>
      <rect x="4.75" y="2" width="9.5" height="15" rx="2" />
      <path d="M8.7 14.6h1.6" />
    </svg>
  )
}
