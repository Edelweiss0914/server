import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const CF_ACCESS_CERTS_URL =
  'https://cheeze0297.cloudflareaccess.com/cdn-cgi/access/certs'
const ALLOWED_AUD = '5217e5d9279113aa89c0a6653f4dbac925c04c951fd15c5508647a63d0b17ccc'
const ALLOWED_EMAILS = ['zoop784@naver.com', 'azdazd0101@gmail.com']

// In-memory JWKS cache
let cachedKeys: { keys: JWKSKey[] } | null = null
let cacheTime = 0
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

interface JWKSKey {
  kid: string
  kty: string
  alg: string
  use: string
  n: string
  e: string
}

function base64urlToUint8Array(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

async function getPublicKeys(): Promise<JWKSKey[]> {
  const now = Date.now()
  if (cachedKeys && now - cacheTime < CACHE_TTL_MS) {
    return cachedKeys.keys
  }
  const res = await fetch(CF_ACCESS_CERTS_URL, { cache: 'no-store' })
  const jwks = await res.json()
  cachedKeys = jwks
  cacheTime = now
  return jwks.keys as JWKSKey[]
}

async function importRSAPublicKey(jwk: JWKSKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  )
}

interface JWTPayload {
  aud: string | string[]
  email?: string
  exp?: number
  [key: string]: unknown
}

async function verifyCloudflareJWT(token: string): Promise<JWTPayload | null> {
  const parts = token.split('.')
  if (parts.length !== 3) return null

  const [headerB64, payloadB64, signatureB64] = parts

  let header: { kid?: string; alg?: string }
  let payload: JWTPayload
  try {
    header = JSON.parse(atob(headerB64.replace(/-/g, '+').replace(/_/g, '/')))
    payload = JSON.parse(
      new TextDecoder().decode(base64urlToUint8Array(payloadB64))
    )
  } catch {
    return null
  }

  // Check expiration
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    return null
  }

  // Check audience
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud]
  if (!aud.includes(ALLOWED_AUD)) {
    return null
  }

  // Fetch public keys and find matching kid
  let keys: JWKSKey[]
  try {
    keys = await getPublicKeys()
  } catch {
    return null
  }

  const matchingKey = header.kid
    ? keys.find((k) => k.kid === header.kid)
    : keys[0]
  if (!matchingKey) return null

  // Verify signature
  try {
    const cryptoKey = await importRSAPublicKey(matchingKey)
    const signingInput = `${headerB64}.${payloadB64}`
    const signature = base64urlToUint8Array(signatureB64).buffer as ArrayBuffer
    const data = new TextEncoder().encode(signingInput).buffer as ArrayBuffer
    const valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      cryptoKey,
      signature,
      data
    )
    if (!valid) return null
  } catch {
    return null
  }

  return payload
}

function isLocalRequest(request: NextRequest): boolean {
  const host = request.headers.get('host') || ''
  return (
    host.startsWith('localhost') ||
    host.startsWith('127.0.0.1') ||
    host.startsWith('[::1]')
  )
}

// IMPORTANT: export function must be named "proxy", NOT "middleware"
export async function proxy(request: NextRequest) {
  // Dev bypass for localhost
  if (isLocalRequest(request)) {
    const response = NextResponse.next()
    response.headers.set('x-admin-email', 'dev@localhost')
    return response
  }

  const jwtToken =
    request.headers.get('Cf-Access-Jwt-Assertion') ||
    request.cookies.get('CF_Authorization')?.value
  if (!jwtToken) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const payload = await verifyCloudflareJWT(jwtToken)
  if (!payload) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!ALLOWED_EMAILS.includes((payload.email as string).toLowerCase())) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const response = NextResponse.next()
  response.headers.set('x-admin-email', payload.email as string)
  return response
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
}
