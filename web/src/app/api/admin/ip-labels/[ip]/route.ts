import { type NextRequest } from 'next/server'
import { CONTROL_API_URL } from '@/lib/control-api'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ ip: string }> }
) {
  const { ip } = await params

  try {
    const upstream = await fetch(
      `${CONTROL_API_URL}/admin/ip-labels/${encodeURIComponent(ip)}`,
      {
        method: 'DELETE',
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
