import { type NextRequest } from 'next/server'
import { CONTROL_API_URL } from '@/lib/control-api'

const ALLOWED_ACTIONS = ['start', 'stop']

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; action: string }> }
) {
  const { id, action } = await params

  if (!ALLOWED_ACTIONS.includes(action)) {
    return Response.json({ error: 'invalid action' }, { status: 400 })
  }

  try {
    const upstream = await fetch(
      `${CONTROL_API_URL}/services/${encodeURIComponent(id)}/${encodeURIComponent(action)}`,
      {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'X-Cheeze-Control-Token': process.env.ADMIN_CONTROL_TOKEN || '',
        },
      }
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
