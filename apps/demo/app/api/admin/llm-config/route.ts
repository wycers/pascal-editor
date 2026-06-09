import type { NextRequest, NextResponse } from 'next/server'
import { adminApiJson, adminApiPreflight, guardAdminApiRequest } from '@/lib/admin-api-security'
import { normalizeLlmConfigInput, publicLlmConfig } from '@/lib/llm/config'
import { getLlmConfig, saveLlmConfig } from '@/lib/llm/config-store'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export function OPTIONS(request: NextRequest) {
  return adminApiPreflight(request)
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const guard = guardAdminApiRequest(request)
  if (guard) return guard

  const config = await getLlmConfig()
  return adminApiJson(request, { config: publicLlmConfig(config) })
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const guard = guardAdminApiRequest(request)
  if (guard) return guard

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return adminApiJson(
      request,
      { error: 'invalid_request', details: 'body must be valid JSON' },
      { status: 400 },
    )
  }

  const parsed = normalizeInput(body)
  if (!parsed.ok) {
    return adminApiJson(
      request,
      { error: 'invalid_request', details: parsed.details },
      { status: 400 },
    )
  }

  const saved = await saveLlmConfig(parsed.value)
  return adminApiJson(request, { config: publicLlmConfig(saved) })
}

function normalizeInput(
  body: unknown,
):
  | { ok: true; value: ReturnType<typeof normalizeLlmConfigInput> }
  | { ok: false; details: unknown } {
  try {
    return { ok: true, value: normalizeLlmConfigInput(body as never) }
  } catch (error) {
    return { ok: false, details: error instanceof Error ? error.message : String(error) }
  }
}
