import type { SceneGraph } from '@pascal-app/core/clone-scene-graph'
import { createPascalMcpServer, SceneBridge } from '@pascal-app/mcp'
import { type LlmMessage, runMcpToolLoop } from '@pascal-app/mcp/ai'
import { createSceneOperations } from '@pascal-app/mcp/operations'
import type { SceneMeta, SceneStore } from '@pascal-app/mcp/storage/types'
import type { LlmClient } from './client'
import type { RuntimeLlmConfig } from './config'

const ALLOWED_TOOL_NAMES = [
  'list_levels',
  'get_level_summary',
  'verify_scene',
  'create_from_template',
  'create_house_from_brief',
  'create_story_shell',
  'create_roof',
  'create_stair_between_levels',
  'create_room',
  'add_door',
  'add_window',
  'furnish_room',
  'search_assets',
  'place_item',
  'validate_scene',
  'export_json',
  'undo',
  'redo',
] as const

const MUTATING_TOOL_NAMES = [
  'create_from_template',
  'create_house_from_brief',
  'create_story_shell',
  'create_roof',
  'create_stair_between_levels',
  'create_room',
  'add_door',
  'add_window',
  'furnish_room',
  'place_item',
] as const

export type PascalAgentGenerationInput = {
  brief: string
  projectName?: string
  constraints?: string
}

export type PascalAgentGenerationResult = {
  meta: SceneMeta
  sceneGraph: SceneGraph
  summary: string
  toolCallCount: number
  provider: RuntimeLlmConfig['provider']
  model: string
}

export type PascalAgentGenerationOptions = {
  input: PascalAgentGenerationInput
  config: RuntimeLlmConfig
  store: SceneStore
  client: LlmClient
}

export async function runPascalAgentGeneration({
  input,
  config,
  store,
  client,
}: PascalAgentGenerationOptions): Promise<PascalAgentGenerationResult> {
  const bridge = new SceneBridge()
  bridge.loadDefault()
  const operations = createSceneOperations({ bridge, store })
  const server = createPascalMcpServer({ bridge, operations, name: 'pascal-demo-agent' })
  const llmClient = client

  try {
    const messages: LlmMessage[] = buildInitialMessages(input)
    const loopResult = await runMcpToolLoop({
      server,
      client: llmClient,
      model: config.model,
      messages,
      temperature: config.temperature,
      maxToolIterations: config.maxToolIterations,
      allowedToolNames: ALLOWED_TOOL_NAMES,
      mutatingToolNames: MUTATING_TOOL_NAMES,
      clientName: 'pascal-demo-agent',
    })

    if (!loopResult.didMutate) {
      throw new Error('llm_no_scene_mutation')
    }

    const validation = operations.validateScene()
    if (!validation.valid) {
      throw new Error(`scene_invalid:${JSON.stringify(validation.errors.slice(0, 5))}`)
    }

    const sceneGraph = operations.exportSceneGraph()
    const active = operations.getActiveScene()
    const meta = await operations.saveScene({
      ...(active ? { id: active.id, expectedVersion: active.version } : {}),
      name: input.projectName?.trim() || active?.name || 'LLM generated Pascal scene',
      projectId: active?.projectId ?? 'demo',
      ownerId: active?.ownerId ?? null,
      thumbnailUrl: active?.thumbnailUrl ?? null,
      graph: sceneGraph,
      saveMode: 'checkpoint',
      publish: true,
      operation: 'llm_demo_generate',
    })
    await operations.appendSceneEvent({
      sceneId: meta.id,
      version: meta.version,
      kind: 'llm_demo_generate',
      graph: sceneGraph,
    })

    return {
      meta,
      sceneGraph,
      summary:
        loopResult.finalText ||
        `Generated ${meta.name} with ${loopResult.toolCallCount} MCP tool calls.`,
      toolCallCount: loopResult.toolCallCount,
      provider: config.provider,
      model: config.model,
    }
  } finally {
    await server.close().catch(() => undefined)
  }
}

function buildInitialMessages(input: PascalAgentGenerationInput): LlmMessage[] {
  const projectName = input.projectName?.trim() || 'Untitled Pascal demo'
  const constraints = input.constraints?.trim() || 'No additional constraints.'
  return [
    {
      role: 'system',
      content: [
        'You generate Pascal 3D building scenes by calling the provided MCP tools.',
        'Call at least one creation or mutation tool before answering.',
        'Use compact rectangular coordinates in meters unless the user gives exact dimensions.',
        'Prefer modular, reusable building parts: levels, rooms, slabs, ceilings, doors, windows, roof, stairs, and catalog items.',
        'After creating or editing the scene, call verify_scene. The host will validate and save the final scene.',
        'Return a short final Chinese summary after tool work is complete.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `Project name: ${projectName}`,
        `Brief: ${input.brief}`,
        `Constraints: ${constraints}`,
        'Create a browser-ready Pascal scene for the sales demo.',
      ].join('\n'),
    },
  ]
}
