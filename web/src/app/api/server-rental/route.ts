interface RentalRequestBody {
  requesterName?: string
  contact?: string
  desiredServer?: string
  expectedPlayers?: string
  preferredSchedule?: string
  notes?: string
}

// IP당 최대 3회 / 10분 슬라이딩 윈도우
const RATE_LIMIT_MAX = 3
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000
const rateLimitMap = new Map<string, number[]>()

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const timestamps = (rateLimitMap.get(ip) ?? []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS
  )
  if (timestamps.length >= RATE_LIMIT_MAX) return true
  timestamps.push(now)
  rateLimitMap.set(ip, timestamps)
  return false
}

const WEBHOOK_URL = process.env.SERVER_RENTAL_WEBHOOK_URL || ''
const WEBHOOK_USERNAME =
  process.env.SERVER_RENTAL_WEBHOOK_USERNAME || 'CHEEZE Rental Intake'

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value
}

function normalize(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return ''
  return truncate(value.trim(), maxLength)
}

function buildWebhookContent(payload: Required<RentalRequestBody>) {
  return [
    '새 서버 대여 신청이 접수되었습니다.',
    `신청자: ${payload.requesterName}`,
    `연락 수단: ${payload.contact}`,
    `희망 서버: ${payload.desiredServer}`,
    `예상 인원: ${payload.expectedPlayers}`,
    `희망 일정: ${payload.preferredSchedule}`,
    `추가 메모: ${payload.notes || '없음'}`,
  ].join('\n')
}

export async function POST(request: Request) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (isRateLimited(ip)) {
    return Response.json(
      { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
      { status: 429 }
    )
  }

  if (!WEBHOOK_URL) {
    return Response.json(
      { error: '대여 신청 웹훅이 아직 설정되지 않았습니다.' },
      { status: 503 }
    )
  }

  let body: RentalRequestBody
  try {
    body = (await request.json()) as RentalRequestBody
  } catch {
    return Response.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 })
  }

  const payload = {
    requesterName: normalize(body.requesterName, 60),
    contact: normalize(body.contact, 120),
    desiredServer: normalize(body.desiredServer, 80),
    expectedPlayers: normalize(body.expectedPlayers, 40),
    preferredSchedule: normalize(body.preferredSchedule, 120),
    notes: normalize(body.notes, 800),
  }

  if (!payload.requesterName || !payload.contact || !payload.desiredServer) {
    return Response.json(
      { error: '신청자 이름, 연락 수단, 희망 서버 유형은 필수입니다.' },
      { status: 400 }
    )
  }

  let webhookResponse: Response
  try {
    webhookResponse = await fetch(`${WEBHOOK_URL}?wait=true`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: WEBHOOK_USERNAME,
        content: buildWebhookContent(payload),
        allowed_mentions: {
          parse: [],
        },
      }),
    })
  } catch {
    return Response.json(
      { error: '대여 신청 전달 중 네트워크 오류가 발생했습니다.' },
      { status: 502 }
    )
  }

  if (!webhookResponse.ok) {
    return Response.json(
      { error: `대여 신청 전달이 실패했습니다. (${webhookResponse.status})` },
      { status: 502 }
    )
  }

  return Response.json(
    { ok: true, message: '대여 신청이 접수되었습니다. 운영자가 확인 후 연락드릴 예정입니다.' },
    { status: 201 }
  )
}
