import { issueRealtimeTicket } from '@wa/core/realtime'
import { auth } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * Hands the signed-in browser a one-time ticket for the live-update socket,
 * and says where that socket is.
 *
 * The socket is served by the webhook service, which cannot read the
 * dashboard's session cookie. This route can, so it vouches for the user by
 * leaving a ticket in Redis that the socket is then opened with.
 */
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return new Response('unauthorized', { status: 401 })

  let ticket: string
  try {
    ticket = await issueRealtimeTicket({ userId: session.user.id, orgId: session.user.orgId })
  } catch {
    // Redis is down. The page keeps working by polling until it is back.
    return new Response('realtime unavailable', { status: 503 })
  }

  return Response.json({ ticket, url: socketUrl(req) }, { headers: { 'Cache-Control': 'no-store' } })
}

/**
 * Where the browser should connect, or null for "/ws on this same origin".
 *
 * In production nginx puts the dashboard and the webhook service behind one
 * domain, so same-origin is right. In development they are two ports on the
 * same machine. REALTIME_URL overrides both, for any other arrangement.
 */
function socketUrl(req: Request): string | null {
  if (process.env.REALTIME_URL) return process.env.REALTIME_URL
  if (process.env.NODE_ENV === 'production') return null
  // The page's own hostname, so it also works when opened from another device on the LAN.
  return `ws://${new URL(req.url).hostname}:${process.env.WEBHOOK_PORT || 3001}/ws`
}
