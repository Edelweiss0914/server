import { fetchPterodactylOverview } from '@/lib/pterodactyl'

export async function GET() {
  const data = await fetchPterodactylOverview()
  const ok = data.panel.reachable && (data.applicationApiReachable || !data.panel.applicationApiConfigured)
  return Response.json(data, { status: ok ? 200 : 502 })
}
