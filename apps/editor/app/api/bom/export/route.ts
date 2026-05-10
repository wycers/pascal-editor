import { BomRulesSchema } from '@pascal-app/core'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import defaultRules from '@/config/modular-bom-rules.json'
import { buildBomExportBundle } from '@/lib/bom-export'
import { apiGraphSchema } from '@/lib/graph-schema'
import {
  guardSceneApiRequest,
  sceneApiJson,
  sceneApiPreflight,
  withSceneApiHeaders,
} from '@/lib/scene-api-security'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const exportBomSchema = z.object({
  sceneGraph: apiGraphSchema,
  projectName: z.string().min(1).max(200).optional(),
  rulesOverride: BomRulesSchema.optional(),
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

  const parsed = exportBomSchema.safeParse(body)
  if (!parsed.success) {
    return sceneApiJson(
      request,
      { error: 'invalid_request', details: parsed.error.issues },
      { status: 400 },
    )
  }

  try {
    const rules = parsed.data.rulesOverride ?? BomRulesSchema.parse(defaultRules)
    const bundle = await buildBomExportBundle({
      sceneGraph: parsed.data.sceneGraph,
      rules,
      projectName: parsed.data.projectName,
    })

    const response = new NextResponse(Buffer.from(bundle.bytes), {
      status: 200,
      headers: {
        'Content-Type': bundle.contentType,
        'Content-Disposition': `attachment; filename="${bundle.filename}"`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'X-Bom-Pdf-Generated': bundle.pdfGenerated ? 'true' : 'false',
      },
    })
    return withSceneApiHeaders(request, response)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unexpected_error'
    return sceneApiJson(request, { error: 'bom_export_failed', message }, { status: 500 })
  }
}
