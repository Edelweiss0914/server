const AI_QUEUE_URL =
  process.env.AI_QUEUE_URL || 'http://127.0.0.1:11435'

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const upstream = await fetch(`${AI_QUEUE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const data = await upstream.json()
    return Response.json(data, { status: upstream.status })
  } catch {
    return Response.json(
      { error: 'AI 서비스에 연결하지 못했습니다.' },
      { status: 502 }
    )
  }
}
