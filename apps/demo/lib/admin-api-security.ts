import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'

const ALLOWED_METHODS = 'GET, PUT, OPTIONS'
const ALLOWED_HEADERS = 'authorization, content-type, x-pascal-admin-token'

export function adminApiPreflight(request: Request): NextResponse {
  return withAdminApiHeaders(request, new NextResponse(null, { status: 204 }))
}

export function guardAdminApiRequest(request: Request): NextResponse | null {
  const token = process.env.PASCAL_DEMO_ADMIN_TOKEN
  if (!token) {
    return adminApiJson(request, { error: 'admin_token_required' }, { status: 503 })
  }

  const supplied = bearerToken(request) ?? request.headers.get('x-pascal-admin-token')
  if (supplied && safeEqual(supplied, token)) return null
  return adminApiJson(request, { error: 'unauthorized' }, { status: 401 })
}

export function adminApiJson(request: Request, body: unknown, init?: ResponseInit): NextResponse {
  return withAdminApiHeaders(request, NextResponse.json(body, init))
}

export function withAdminApiHeaders<T extends Response>(request: Request, response: T): T {
  const origin = request.headers.get('origin')
  if (origin && isSameOrigin(request, origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin)
    response.headers.append('Vary', 'Origin')
  }
  response.headers.set('Access-Control-Allow-Methods', ALLOWED_METHODS)
  response.headers.set('Access-Control-Allow-Headers', ALLOWED_HEADERS)
  response.headers.set('Cache-Control', 'no-store')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  return response
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization')
  if (!header) return null
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match?.[1] ?? null
}

function safeEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a)
  const bBuffer = Buffer.from(b)
  if (aBuffer.length !== bBuffer.length) return false
  return timingSafeEqual(aBuffer, bBuffer)
}

function isSameOrigin(request: Request, origin: string): boolean {
  try {
    const parsedOrigin = new URL(origin)
    const requestUrl = new URL(request.url)
    return (
      `${parsedOrigin.protocol}//${parsedOrigin.host}` ===
      `${requestUrl.protocol}//${requestUrl.host}`
    )
  } catch {
    return false
  }
}
