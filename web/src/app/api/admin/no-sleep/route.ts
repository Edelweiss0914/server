import { type NextRequest } from 'next/server'

const CONTROL_API_URL =
  process.env.CONTROL_API_URL || 'http://127.0.0.1:11437'

export async function GET(_request: NextRequest) {
  const token = process.env.ADMIN_CONTROL_TOKEN || ''
  try {
    const upstream = await fetch(
      `${CONTROL_API_URL}/api/control/admin/no-sleep`,
      {
        cache: 'no-store',
        headers: { 'X-Cheeze-Control-Token': token },
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

export async function POST(_request: NextRequest) {
  const token = process.env.ADMIN_CONTROL_TOKEN || ''
  try {
    const upstream = await fetch(
      `${CONTROL_API_URL}/api/control/admin/no-sleep`,
      {
        method: 'POST',
        cache: 'no-store',
        headers: { 'X-Cheeze-Control-Token': token },
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

export async function DELETE(_request: NextRequest) {
  const token = process.env.ADMIN_CONTROL_TOKEN || ''
  try {
    const upstream = await fetch(
      `${CONTROL_API_URL}/api/control/admin/no-sleep`,
      {
        method: 'DELETE',
        cache: 'no-store',
        headers: { 'X-Cheeze-Control-Token': token },
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
