import { type NextRequest } from 'next/server'

const CONTROL_API_URL =
  process.env.CONTROL_API_URL || 'http://127.0.0.1:11437'

export async function GET(_request: NextRequest) {
  try {
    const upstream = await fetch(
      `${CONTROL_API_URL}/api/control/admin/status`,
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
