import type { SceneGraph } from '@pascal-app/core'
import type { LlmToolTraceEntry } from '@pascal-app/mcp/ai'
import type { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveEditorAiRuntimeConfig } from '@/lib/ai/config'
import {
  type EditorAiRequest,
  mapEditorAiErrorPayload,
  runEditorAiMcp,
} from '@/lib/ai/mcp'
import type { EditorAiStreamEvent } from '@/lib/ai/stream-events'
import { apiGraphSchema } from '@/lib/graph-schema'
import {
  guardSceneApiRequest,
  sceneApiJson,
  sceneApiPreflight,
  withSceneApiHeaders,
} from '@/lib/scene-api-security'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const editorAiRequestSchema = z.object({
  prompt: z.string().max(4000),
  projectName: z.string().max(200).optional(),
  selectedNodeIds: z.array(z.string()).default([]),
  sceneGraph: apiGraphSchema,
  stream: z.boolean().optional(),
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

export async function POST(request: NextRequest): Promise<Response> {
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

    const runInput: EditorAiRequest = {
      prompt,
      projectName: parsed.data.projectName,
      sceneGraph,
      selectedNodeIds: sanitizeSelectedNodeIds(sceneGraph, parsed.data.selectedNodeIds),
    }

    if (parsed.data.stream) {
      return streamEditorAiMcp(request, runInput)
    }

    const result = await runEditorAiMcp(runInput, process.env, request.signal)

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

function streamEditorAiMcp(request: NextRequest, input: EditorAiRequest): Response {
  const encoder = new TextEncoder()
  let closed = false
  let didEmitTerminalEvent = false

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enqueue = (chunk: string) => {
        if (!closed) controller.enqueue(encoder.encode(chunk))
      }

      const close = () => {
        if (closed) return
        closed = true
        try {
          controller.close()
        } catch {
          // The client may have already closed the stream.
        }
      }

      request.signal.addEventListener('abort', close, { once: true })
      enqueue('retry: 1000\n\n')

      void runEditorAiMcp(input, process.env, {
        signal: request.signal,
        stream: (event) => {
          if (event.type === 'final' || event.type === 'error') {
            didEmitTerminalEvent = true
          }
          enqueue(formatSseEvent(event))
        },
      })
        .then(close)
        .catch((error) => {
          if (!didEmitTerminalEvent) {
            const mapped = mapEditorAiErrorPayload(error)
            enqueue(
              formatSseEvent({
                type: 'error',
                status: mapped.status,
                ...mapped.body,
              }),
            )
          }
          close()
        })
    },
    cancel() {
      closed = true
    },
  })

  return withSceneApiHeaders(
    request,
    new Response(stream, {
      headers: {
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'Content-Type': 'text/event-stream; charset=utf-8',
        'X-Accel-Buffering': 'no',
      },
    }),
  )
}

function hasUsableSceneGraph(sceneGraph: SceneGraph): boolean {
  return Object.keys(sceneGraph.nodes ?? {}).length > 0 && sceneGraph.rootNodeIds.length > 0
}

function sanitizeSelectedNodeIds(sceneGraph: SceneGraph, selectedNodeIds: string[]): string[] {
  const nodes = sceneGraph.nodes as Record<string, unknown>
  return selectedNodeIds.filter((id) => Boolean(nodes[id]))
}

function mapEditorAiError(request: NextRequest, error: unknown): NextResponse {
  const mapped = mapEditorAiErrorPayload(error)
  return sceneApiJson(request, mapped.body, { status: mapped.status })
}

function formatSseEvent(event: EditorAiStreamEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`
}
