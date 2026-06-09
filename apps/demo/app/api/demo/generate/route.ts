import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { generateDemoPayload } from '@/lib/demo-generate-service'
import {
  guardSceneApiRequest,
  sceneApiJson,
  sceneApiPreflight,
  withSceneApiHeaders,
} from '@/lib/scene-api-security'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const demoGenerateSchema = z.object({
  brief: z.string().min(1).max(4000),
  projectName: z.string().min(1).max(200).optional(),
  constraints: z.string().max(4000).optional(),
})

export function OPTIONS(request: NextRequest) {
  return sceneApiPreflight(request)
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const guard = guardSceneApiRequest(request)
  if (guard) return guard

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return sceneApiJson(
      request,
      { error: 'invalid_request', details: 'body must be valid JSON' },
      { status: 400 },
    )
  }

  const parsed = demoGenerateSchema.safeParse(body)
  if (!parsed.success) {
    return sceneApiJson(
      request,
      { error: 'invalid_request', details: parsed.error.issues },
      { status: 400 },
    )
  }

  try {
    const payload = await generateDemoPayload(parsed.data)
    return withSceneApiHeaders(request, NextResponse.json(payload, { status: 201 }))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unexpected_error'
    return sceneApiJson(request, { error: 'demo_generate_failed', message }, { status: 500 })
  }
}
