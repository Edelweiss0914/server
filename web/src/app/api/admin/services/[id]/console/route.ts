import { type NextRequest } from 'next/server'

const CONTROL_API_URL =
  process.env.CONTROL_API_URL || 'http://127.0.0.1:11437'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const { searchParams } = new URL(request.url)
    const queryParams = new URLSearchParams()
    if (searchParams.has('tail')) queryParams.set('tail', searchParams.get('tail')!)
    if (searchParams.has('offset')) queryParams.set('offset', searchParams.get('offset')!)

    const query = queryParams.toString() ? `?${queryParams.toString()}` : ''
    const upstream = await fetch(
      `${CONTROL_API_URL}/api/control/services/${encodeURIComponent(id)}/console${query}`,
      {
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const { command } = await request.json()
    const upstream = await fetch(
      `${CONTROL_API_URL}/api/control/services/${encodeURIComponent(id)}/console`,
      {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          'X-Cheeze-Control-Token': process.env.ADMIN_CONTROL_TOKEN || '',
        },
        body: JSON.stringify({ command }),
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
