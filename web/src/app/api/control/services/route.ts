const CONTROL_API_URL =
  process.env.CONTROL_API_URL || 'http://127.0.0.1:11437'

export async function GET() {
  try {
    const upstream = await fetch(`${CONTROL_API_URL}/services`, {
      cache: 'no-store',
    })
    const data = await upstream.json()
    return Response.json(data, { status: upstream.status })
  } catch {
    return Response.json(
      { error: '제어 API에 연결하지 못했습니다.' },
      { status: 502 }
    )
  }
}
