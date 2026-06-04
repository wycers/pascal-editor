import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { computeDemoSceneMetrics } from '@/lib/demo-metrics'
import { generateDemoSceneFromBrief } from '@/lib/demo-scene'
import {
  guardSceneApiRequest,
  sceneApiJson,
  sceneApiPreflight,
  withSceneApiHeaders,
} from '@/lib/scene-api-security'
import { getSceneStore } from '@/lib/scene-store-server'

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
    const generated = generateDemoSceneFromBrief(parsed.data)
    const store = await getSceneStore()
    const meta = await store.save({
      name: generated.projectName,
      projectId: 'demo',
      graph: generated.sceneGraph,
      saveMode: 'checkpoint',
      publish: true,
      operation: 'demo_generate',
    })

    if (store.appendSceneEvent) {
      await store.appendSceneEvent({
        sceneId: meta.id,
        version: meta.version,
        kind: 'demo_generate',
        graph: generated.sceneGraph,
      })
    }

    const metrics = computeDemoSceneMetrics(generated.sceneGraph)
    const payload = {
      sceneId: meta.id,
      sceneUrl: `/scene/${meta.id}?demo=1`,
      nodeCount: metrics.sourceNodeCount,
      roomCount: metrics.roomCount,
      validation: {
        valid: true,
        errors: [] as string[],
      },
      limitations: generated.limitations,
      projectName: generated.projectName,
      summary: generated.summary,
      metrics,
    }

    return withSceneApiHeaders(request, NextResponse.json(payload, { status: 201 }))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unexpected_error'
    return sceneApiJson(request, { error: 'demo_generate_failed', message }, { status: 500 })
  }
}
