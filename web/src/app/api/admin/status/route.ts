import { CONTROL_API_URL } from '@/lib/control-api'

export async function GET() {
  try {
    const upstream = await fetch(`${CONTROL_API_URL}/admin/status`, {
      cache: 'no-store',
      headers: {
        'X-Cheeze-Control-Token': process.env.ADMIN_CONTROL_TOKEN || '',
      },
    })
    const data = await upstream.json()
    const services = data?.services

    if (!upstream.ok) {
      return Response.json(data, { status: upstream.status })
    }

    if (!Array.isArray(services)) {
      const controlApiMessage = data?.control_api?.error
      const controlApiStatus = data?.control_api?.status_code
      const detail =
        typeof controlApiMessage === 'string' && controlApiMessage
          ? controlApiMessage
          : typeof controlApiStatus === 'number'
            ? `control API status ${controlApiStatus}`
            : 'service list unavailable'

      return Response.json(
        {
          error: 'service_status_unavailable',
          message: `관리자 서비스 상태를 불러오지 못했습니다: ${detail}`,
          control_api: data?.control_api ?? null,
        },
        { status: 502 }
      )
    }

    return Response.json(data, { status: upstream.status })
  } catch {
    return Response.json(
      { error: 'control_api_unreachable', message: '제어 API에 연결하지 못했습니다.' },
      { status: 502 }
    )
  }
}
