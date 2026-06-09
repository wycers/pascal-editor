import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import type { SceneGraph } from '@pascal-app/core/clone-scene-graph'
import { createPascalMcpServer, SceneBridge } from '@pascal-app/mcp'
import { createSceneOperations } from '@pascal-app/mcp/operations'
import type { SceneMeta, SceneStore } from '@pascal-app/mcp/storage/types'
import type { LlmClient, LlmMessage, LlmTool, LlmToolCall } from './client'
import type { RuntimeLlmConfig } from './config'

const ALLOWED_TOOL_NAMES = new Set([
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
])

const MUTATING_TOOL_NAMES = new Set([
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
])

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
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair()
  const mcpClient = new Client({ name: 'pascal-demo-agent', version: '0.1.0' })

  try {
    await Promise.all([server.connect(serverTransport), mcpClient.connect(clientTransport)])
    const tools = await listAllowedTools(mcpClient)
    const messages: LlmMessage[] = buildInitialMessages(input)
    let toolCallCount = 0
    let didMutate = false
    let finalText = ''

    for (let iteration = 0; iteration <= config.maxToolIterations; iteration++) {
      const completion = await client.complete({
        model: config.model,
        messages,
        tools,
        temperature: config.temperature,
      })
      finalText = completion.content ?? finalText
      messages.push({
        role: 'assistant',
        content: completion.content,
        toolCalls: completion.toolCalls,
      })

      if (completion.toolCalls.length === 0) break
      if (iteration === config.maxToolIterations) {
        throw new Error('max_tool_iterations_exceeded')
      }

      for (const toolCall of completion.toolCalls) {
        assertAllowedTool(toolCall)
        if (MUTATING_TOOL_NAMES.has(toolCall.name)) didMutate = true
        toolCallCount++
        const result = await mcpClient.callTool({
          name: toolCall.name,
          arguments: toolCall.arguments,
        })
        messages.push({
          role: 'tool',
          toolCallId: toolCall.id,
          content: formatToolResultContent(result),
        })
      }
    }

    if (!didMutate) {
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
      summary: finalText || `Generated ${meta.name} with ${toolCallCount} MCP tool calls.`,
      toolCallCount,
      provider: config.provider,
      model: config.model,
    }
  } finally {
    await mcpClient.close().catch(() => undefined)
    await server.close().catch(() => undefined)
  }
}

async function listAllowedTools(client: Client): Promise<LlmTool[]> {
  const { tools } = await client.listTools()
  return tools
    .filter((tool) => ALLOWED_TOOL_NAMES.has(tool.name))
    .map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        ...(tool.description ? { description: tool.description } : {}),
        parameters: normalizeParameters(tool.inputSchema),
      },
    }))
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

function assertAllowedTool(toolCall: LlmToolCall): void {
  if (!ALLOWED_TOOL_NAMES.has(toolCall.name)) {
    throw new Error(`tool_not_allowed:${toolCall.name}`)
  }
}

function normalizeParameters(schema: unknown): Record<string, unknown> {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return { type: 'object', properties: {} }
  }
  return schema as Record<string, unknown>
}

function formatToolResultContent(result: unknown): string {
  const text = JSON.stringify(simplifyToolResult(result))
  if (text.length <= 8000) return text
  return `${text.slice(0, 8000)}...<truncated>`
}

function simplifyToolResult(result: unknown): unknown {
  if (!result || typeof result !== 'object') return result
  const record = result as Record<string, unknown>
  return {
    isError: record.isError ?? false,
    structuredContent: record.structuredContent,
    content: record.content,
  }
}
