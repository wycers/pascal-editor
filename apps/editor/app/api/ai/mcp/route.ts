import type { SceneGraph } from '@pascal-app/core'
import type { LlmToolTraceEntry } from '@pascal-app/mcp/ai'
import type { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveEditorAiRuntimeConfig } from '@/lib/ai/config'
import { runEditorAiMcp } from '@/lib/ai/mcp'
import { apiGraphSchema } from '@/lib/graph-schema'
import { guardSceneApiRequest, sceneApiJson, sceneApiPreflight } from '@/lib/scene-api-security'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const editorAiRequestSchema = z.object({
  prompt: z.string().max(4000),
  projectName: z.string().max(200).optional(),
  selectedNodeIds: z.array(z.string()).default([]),
  sceneGraph: apiGraphSchema,
})

type EditorAiResponse = {
  sceneGraph: SceneGraph
  summary: string
  warnings: string[]
  toolTrace: LlmToolTraceEntry[]
  toolCallCount: number
}

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

  const parsed = editorAiRequestSchema.safeParse(body)
  if (!parsed.success) {
    return sceneApiJson(
      request,
      { error: 'invalid_request', details: parsed.error.issues },
      { status: 400 },
    )
  }

  const prompt = parsed.data.prompt.trim()
  if (!prompt) {
    return sceneApiJson(request, { error: 'prompt_required' }, { status: 400 })
  }

  const sceneGraph = parsed.data.sceneGraph as SceneGraph
  if (!hasUsableSceneGraph(sceneGraph)) {
    return sceneApiJson(request, { error: 'scene_snapshot_invalid' }, { status: 400 })
  }

  try {
    if (!resolveEditorAiRuntimeConfig(process.env)) {
      return sceneApiJson(request, { error: 'ai_api_key_missing' }, { status: 503 })
    }

    const result = await runEditorAiMcp(
      {
        prompt,
        projectName: parsed.data.projectName,
        sceneGraph,
        selectedNodeIds: sanitizeSelectedNodeIds(sceneGraph, parsed.data.selectedNodeIds),
      },
      process.env,
      request.signal,
    )

    const payload: EditorAiResponse = {
      sceneGraph: result.sceneGraph,
      summary: result.summary,
      warnings: result.warnings,
      toolTrace: result.toolTrace,
      toolCallCount: result.toolCallCount,
    }

    return sceneApiJson(request, payload)
  } catch (error) {
    return mapEditorAiError(request, error)
  }
}

function hasUsableSceneGraph(sceneGraph: SceneGraph): boolean {
  return Object.keys(sceneGraph.nodes ?? {}).length > 0 && sceneGraph.rootNodeIds.length > 0
}

function sanitizeSelectedNodeIds(sceneGraph: SceneGraph, selectedNodeIds: string[]): string[] {
  const nodes = sceneGraph.nodes as Record<string, unknown>
  return selectedNodeIds.filter((id) => Boolean(nodes[id]))
}

function mapEditorAiError(request: NextRequest, error: unknown): NextResponse {
  const message = error instanceof Error ? error.message : String(error)

  if (message === 'ai_api_key_missing') {
    return sceneApiJson(request, { error: 'ai_api_key_missing' }, { status: 503 })
  }

  if (message === 'prompt_required') {
    return sceneApiJson(request, { error: 'prompt_required' }, { status: 400 })
  }

  if (message === 'llm_no_scene_mutation') {
    return sceneApiJson(request, { error: 'llm_no_scene_mutation' }, { status: 422 })
  }

  if (message.startsWith('scene_validation_failed:')) {
    return sceneApiJson(request, { error: 'scene_validation_failed', message }, { status: 422 })
  }

  if (
    message === 'llm_empty_response' ||
    message === 'max_tool_iterations_exceeded' ||
    message === 'no_allowed_tools_available' ||
    message.startsWith('llm_http_error:') ||
    message.startsWith('tool_not_allowed:') ||
    message.startsWith('invalid_tool_arguments:')
  ) {
    return sceneApiJson(request, { error: 'ai_tool_failed', message }, { status: 502 })
  }

  if (message === 'aborted' || message === 'AbortError') {
    return sceneApiJson(request, { error: 'request_aborted' }, { status: 499 })
  }

  return sceneApiJson(request, { error: 'ai_mcp_failed', message }, { status: 500 })
}
