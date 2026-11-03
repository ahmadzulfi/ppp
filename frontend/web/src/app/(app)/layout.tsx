import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma, type Role } from '@wa/db'
import { auth, signOut } from '@/lib/auth'
import { NavRail } from '@/components/layouts/nav-rail'
import { AccountMenu } from '@/components/layouts/account-menu'
import { initials } from '@/utils/format'

const ROLE_LABEL: Record<Role, string> = {
  OWNER: 'Pemilik',
  ADMIN: 'Administrator',
  SUPERVISOR: 'Supervisor',
  AGENT: 'Agen',
  VIEWER: 'Pengamat',
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const org = await prisma.organization.findUnique({ where: { id: session.user.orgId }, select: { name: true } })

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-[72px] shrink-0 items-center justify-between border-b bg-surface px-6">
        <Link href="/" className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] border border-dashed border-navy-300 bg-navy-100 text-navy-700">
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.7}
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M16.666 10.8333C16.666 15.0001 13.7496 17.0835 10.2833 18.2919C10.1018 18.3534 9.90462 18.3505 9.72503 18.2836C6.25038 17.0835 3.334 15.0001 3.334 10.8333V4.99982C3.334 4.7788 3.42179 4.56683 3.57805 4.41054C3.73432 4.25426 3.94626 4.16646 4.16725 4.16646C5.83375 4.16646 7.91687 3.16642 9.36673 1.89972C9.54326 1.74888 9.76782 1.666 10 1.666C10.2322 1.666 10.4567 1.74888 10.6333 1.89972C12.0915 3.17476 14.1662 4.16646 15.8327 4.16646C16.0537 4.16646 16.2657 4.25426 16.4219 4.41054C16.5782 4.56683 16.666 4.7788 16.666 4.99982V10.8333Z" />
            </svg>
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block text-[17px] font-bold text-heading">WA MANTAP</span>
            <span className="block truncate text-[11px] text-fg-muted">
              Otomasi WhatsApp{org?.name ? ` · ${org.name}` : ''}
            </span>
          </span>
        </Link>
        <AccountMenu
          name={session.user.name}
          role={ROLE_LABEL[session.user.role]}
          initials={initials(session.user.name, session.user.email)}
          signOut={async () => {
            'use server'
            await signOut({ redirectTo: '/login' })
          }}
        />
      </header>
      <div className="flex min-h-0 flex-1">
        <NavRail />
        <main className="min-h-0 min-w-0 flex-1">{children}</main>
      </div>
    </div>
  )
}
