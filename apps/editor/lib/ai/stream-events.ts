import type { SceneGraph } from '@pascal-app/core'
import type { LlmToolTraceEntry } from '@pascal-app/mcp/ai'

export type EditorAiStreamEvent =
  | {
      type: 'tool'
      entry: LlmToolTraceEntry
    }
  | {
      type: 'scene'
      sceneGraph: SceneGraph
      toolCallId: string
      toolName: string
    }
  | {
      type: 'final'
      sceneGraph: SceneGraph
      summary: string
      warnings: string[]
      toolTrace: LlmToolTraceEntry[]
      toolCallCount: number
    }
  | {
      type: 'error'
      status: number
      error: string
      message?: string
    }
