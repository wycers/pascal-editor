import type { SceneGraph } from '@pascal-app/core'
import { createPascalMcpServer, createSceneOperations, SceneBridge } from '@pascal-app/mcp'
import {
  type LlmMessage,
  type LlmToolTraceEntry,
  OpenAiCompatibleChatClient,
  runMcpToolLoop,
} from '@pascal-app/mcp/ai'
import { resolveEditorAiRuntimeConfig } from './config'

export type EditorAiRequest = {
  prompt: string
  sceneGraph: SceneGraph
  selectedNodeIds: string[]
  projectName?: string
}

export type EditorAiResult = {
  sceneGraph: SceneGraph
  summary: string
  warnings: string[]
  toolTrace: LlmToolTraceEntry[]
  toolCallCount: number
}

const ALLOWED_TOOL_NAMES = [
  'get_scene',
  'get_node',
  'describe_node',
  'find_nodes',
  'list_levels',
  'get_level_summary',
  'get_walls',
  'get_zones',
  'measure',
  'search_assets',
  'verify_scene',
  'validate_scene',
  'create_level',
  'create_wall',
  'create_room',
  'add_door',
  'add_window',
  'place_item',
  'cut_opening',
  'set_zone',
  'apply_patch',
  'duplicate_level',
  'delete_node',
  'check_collisions',
  'export_json',
] as const

const MUTATING_TOOL_NAMES = [
  'create_level',
  'create_wall',
  'create_room',
  'add_door',
  'add_window',
  'place_item',
  'cut_opening',
  'set_zone',
  'apply_patch',
  'duplicate_level',
  'delete_node',
] as const

let editorAiRunLock: Promise<void> = Promise.resolve()

export async function runEditorAiMcp(
  input: EditorAiRequest,
  env: NodeJS.ProcessEnv = process.env,
  signal?: AbortSignal,
): Promise<EditorAiResult> {
  return withEditorAiRunLock(() => runEditorAiMcpUnlocked(input, env, signal))
}

async function runEditorAiMcpUnlocked(
  input: EditorAiRequest,
  env: NodeJS.ProcessEnv,
  signal?: AbortSignal,
): Promise<EditorAiResult> {
  const config = resolveEditorAiRuntimeConfig(env)
  if (!config) {
    throw new Error('ai_api_key_missing')
  }

  const prompt = input.prompt.trim()
  if (!prompt) {
    throw new Error('prompt_required')
  }

  const bridge = new SceneBridge()
  bridge.setScene(input.sceneGraph.nodes, input.sceneGraph.rootNodeIds)
  bridge.setActiveScene({
    id: 'editor-workspace',
    name: input.projectName?.trim() || 'Pascal editor workspace',
    projectId: 'editor-workspace',
    ownerId: null,
    thumbnailUrl: null,
    version: 0,
  })

  const operations = createSceneOperations({ bridge })
  const client = new OpenAiCompatibleChatClient({
    apiKey: config.apiKey,
    ...(config.baseURL ? { baseURL: config.baseURL } : {}),
  })
  const server = createPascalMcpServer({
    bridge,
    operations,
    name: 'pascal-editor-ai',
  })

  const messages = buildInitialMessages(input)
  const result = await runMcpToolLoop({
    server,
    client,
    model: config.model,
    temperature: config.temperature,
    maxToolIterations: config.maxToolIterations,
    messages,
    allowedToolNames: ALLOWED_TOOL_NAMES,
    mutatingToolNames: MUTATING_TOOL_NAMES,
    signal,
    clientName: 'pascal-editor-ai',
  })

  if (!result.didMutate) {
    throw new Error('llm_no_scene_mutation')
  }

  const validation = operations.validateScene()
  if (!validation.valid) {
    throw new Error(`scene_validation_failed:${JSON.stringify(validation.errors.slice(0, 5))}`)
  }

  const sceneGraph = operations.exportSceneGraph()
  const summary = result.finalText.trim() || `已应用 ${result.toolCallCount} 次 MCP 工具调用。`

  return {
    sceneGraph,
    summary,
    warnings: collectWarnings(result.toolTrace),
    toolTrace: result.toolTrace,
    toolCallCount: result.toolCallCount,
  }
}

function buildInitialMessages(input: EditorAiRequest): LlmMessage[] {
  const projectName = input.projectName?.trim() || 'Pascal editor workspace'
  const prompt = input.prompt.trim()
  const selectedNodes = summarizeSelectedNodes(input.sceneGraph, input.selectedNodeIds)
  const sceneSummary = summarizeSceneGraph(input.sceneGraph)

  return [
    {
      role: 'system',
      content: [
        'You are Pascal editor AI embedded in the existing editor sidebar.',
        'Edit the current scene in place. Do not create a brand-new project or save a separate demo scene.',
        'Prefer the smallest valid change that satisfies the user request.',
        'Use inspection tools first when you need context, then mutate the scene with the editing tools.',
        'Relevant tools: get_scene, get_node, describe_node, find_nodes, list_levels, get_level_summary, get_walls, get_zones, measure, search_assets, create_level, create_wall, create_room, add_door, add_window, place_item, cut_opening, set_zone, apply_patch, duplicate_level, delete_node, check_collisions, export_json, verify_scene, validate_scene.',
        'Finish by validating the result with verify_scene or validate_scene, then answer with a concise Chinese summary.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `Project name: ${projectName}`,
        `Prompt: ${prompt}`,
        `Scene summary: ${JSON.stringify(sceneSummary)}`,
        `Selected nodes: ${selectedNodes.length > 0 ? JSON.stringify(selectedNodes, null, 2) : 'none'}`,
        'Make the edit directly against the current scene graph.',
      ].join('\n'),
    },
  ]
}

function collectWarnings(toolTrace: LlmToolTraceEntry[]): string[] {
  const warnings = new Set<string>()

  for (const entry of toolTrace) {
    if (entry.name !== 'verify_scene') continue
    const issues = readStringArray(
      (entry.result.structuredContent as Record<string, unknown> | undefined)?.issues,
    )
    for (const issue of issues) warnings.add(issue)
  }

  return [...warnings]
}

function summarizeSceneGraph(sceneGraph: SceneGraph): {
  nodeCount: number
  rootNodeCount: number
  typeCounts: Record<string, number>
} {
  const typeCounts: Record<string, number> = {}
  for (const node of Object.values(sceneGraph.nodes)) {
    const type =
      typeof node === 'object' && node && 'type' in node
        ? String((node as { type?: unknown }).type ?? 'unknown')
        : 'unknown'
    typeCounts[type] = (typeCounts[type] ?? 0) + 1
  }

  return {
    nodeCount: Object.keys(sceneGraph.nodes).length,
    rootNodeCount: sceneGraph.rootNodeIds.length,
    typeCounts,
  }
}

function summarizeSelectedNodes(sceneGraph: SceneGraph, selectedNodeIds: string[]) {
  const nodes = sceneGraph.nodes as Record<string, unknown>
  return selectedNodeIds
    .map((id) => {
      const node = nodes[id]
      if (!node) return null
      return {
        id,
        type: String((node as { type?: unknown }).type ?? 'unknown'),
        name:
          typeof (node as { name?: unknown }).name === 'string'
            ? (node as { name: string }).name
            : null,
        parentId:
          typeof (node as { parentId?: unknown }).parentId === 'string'
            ? (node as { parentId: string }).parentId
            : null,
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
}

async function withEditorAiRunLock<T>(run: () => Promise<T>): Promise<T> {
  const previousRun = editorAiRunLock
  let release!: () => void
  editorAiRunLock = new Promise<void>((resolve) => {
    release = resolve
  })

  await previousRun.catch(() => undefined)
  try {
    return await run()
  } finally {
    release()
  }
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === 'string')
}
