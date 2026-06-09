import { expect, test } from 'bun:test'
import type { SceneGraph } from '@pascal-app/core/clone-scene-graph'
import type { SceneMeta, SceneStore } from '@pascal-app/mcp/storage/types'
import type { LlmClient, LlmCompletion, LlmCompletionRequest } from './client'
import { DEFAULT_LLM_CONFIG, type RuntimeLlmConfig } from './config'
import { runPascalAgentGeneration } from './pascal-agent'

test('runPascalAgentGeneration executes MCP tool calls and saves the final scene', async () => {
  const savedGraphs: SceneGraph[] = []
  const eventKinds: string[] = []
  const store = makeStore({
    save: async (opts) => {
      savedGraphs.push(opts.graph)
      return makeMeta({
        id: opts.id ?? 'llm-scene',
        name: opts.name,
        version: 1,
        nodeCount: Object.keys(opts.graph.nodes).length,
      })
    },
    appendSceneEvent: async (opts) => {
      eventKinds.push(opts.kind)
      return {
        eventId: eventKinds.length,
        sceneId: opts.sceneId,
        version: opts.version,
        kind: opts.kind,
        createdAt: new Date().toISOString(),
        graph: opts.graph,
      }
    },
  })
  const client = new ScriptedClient([
    {
      content: null,
      toolCalls: [
        {
          id: 'call_1',
          name: 'create_from_template',
          arguments: { id: 'empty-studio', save: false, name: 'Agent Scene' },
        },
      ],
    },
    {
      content: null,
      toolCalls: [{ id: 'call_2', name: 'verify_scene', arguments: {} }],
    },
    {
      content: '已生成模块化演示场景。',
      toolCalls: [],
    },
  ])

  const result = await runPascalAgentGeneration({
    input: {
      brief: '生成一个小型模块化住宅。',
      projectName: 'Agent Scene',
    },
    config: runtimeConfig(),
    store,
    client,
  })

  expect(result.meta.id).toBe('llm-scene')
  expect(result.toolCallCount).toBe(2)
  expect(result.summary).toContain('模块化')
  expect(savedGraphs).toHaveLength(1)
  expect(Object.keys(savedGraphs[0]!.nodes).length).toBeGreaterThan(0)
  expect(eventKinds).toEqual(['llm_demo_generate'])
})

test('runPascalAgentGeneration fails when max tool iterations are exceeded', async () => {
  const client = new ScriptedClient([
    { content: null, toolCalls: [{ id: 'call_1', name: 'verify_scene', arguments: {} }] },
    { content: null, toolCalls: [{ id: 'call_2', name: 'verify_scene', arguments: {} }] },
  ])

  await expect(
    runPascalAgentGeneration({
      input: { brief: 'Keep calling tools.' },
      config: { ...runtimeConfig(), maxToolIterations: 1 },
      store: makeStore(),
      client,
    }),
  ).rejects.toThrow('max_tool_iterations_exceeded')
})

class ScriptedClient implements LlmClient {
  private index = 0

  constructor(private readonly completions: LlmCompletion[]) {}

  async complete(_request: LlmCompletionRequest): Promise<LlmCompletion> {
    const completion = this.completions[this.index]
    this.index++
    if (!completion) return { content: 'done', toolCalls: [] }
    return completion
  }
}

function runtimeConfig(): RuntimeLlmConfig {
  return {
    ...DEFAULT_LLM_CONFIG,
    enabled: true,
    apiKey: 'test-key',
    resolvedBaseUrl: 'https://api.deepseek.com',
  }
}

function makeStore(overrides: Partial<SceneStore> = {}): SceneStore {
  return {
    backend: 'postgres',
    save: async (opts) =>
      makeMeta({
        id: opts.id ?? 'scene',
        name: opts.name,
        version: opts.expectedVersion ? opts.expectedVersion + 1 : 1,
        nodeCount: Object.keys(opts.graph.nodes).length,
      }),
    load: async () => null,
    list: async () => [],
    delete: async () => false,
    rename: async (_id, name) => makeMeta({ id: 'scene', name, version: 1, nodeCount: 0 }),
    ...overrides,
  }
}

function makeMeta(opts: {
  id: string
  name: string
  version: number
  nodeCount: number
}): SceneMeta {
  const now = new Date().toISOString()
  return {
    id: opts.id,
    name: opts.name,
    projectId: 'demo',
    thumbnailUrl: null,
    version: opts.version,
    createdAt: now,
    updatedAt: now,
    ownerId: null,
    sizeBytes: 0,
    nodeCount: opts.nodeCount,
    url: `/scene/${opts.id}`,
    editorUrl: `/scene/${opts.id}`,
    published: true,
    isDraft: false,
    saveMode: 'checkpoint',
  }
}
