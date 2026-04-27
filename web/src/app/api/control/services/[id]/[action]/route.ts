import { type NextRequest } from 'next/server'

const CONTROL_API_URL =
  process.env.CONTROL_API_URL || 'http://127.0.0.1:11437'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; action: string }> }
) {
  const { id, action } = await params

  const headers: Record<string, string> = {}
  const token = request.headers.get('X-Cheeze-Control-Token')
  if (token) {
    headers['X-Cheeze-Control-Token'] = token
  }

  try {
    const upstream = await fetch(
      `${CONTROL_API_URL}/services/${encodeURIComponent(id)}/${encodeURIComponent(action)}`,
      { method: 'POST', headers, cache: 'no-store', signal: AbortSignal.timeout(175_000) }
    )
    const data = await upstream.json()
    return Response.json(data, { status: upstream.status })
  } catch {
    return Response.json(
      { error: '제어 API에 연결하지 못했습니다.' },
      { status: 502 }
    )
  }
}
