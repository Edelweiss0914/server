import { type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const headers: Record<string, string> = {}
  request.headers.forEach((value, key) => {
    headers[key] = value
  })
  return Response.json({ headers })
}
