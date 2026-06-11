import { afterEach, expect, test } from 'bun:test'
import type { SceneGraph } from '@pascal-app/core'
import { SceneBridge } from '@pascal-app/mcp'
import type { LlmClient, LlmCompletion, LlmCompletionRequest } from '@/lib/llm/client'
import { DEFAULT_LLM_CONFIG } from '@/lib/llm/config'
import { runDemoEditorAiMcp } from './mcp'

const TEST_API_KEY_ENV = 'DEMO_EDITOR_AI_TEST_KEY'
const OLD_TEST_API_KEY = process.env[TEST_API_KEY_ENV]

afterEach(() => {
  if (OLD_TEST_API_KEY === undefined) delete process.env[TEST_API_KEY_ENV]
  else process.env[TEST_API_KEY_ENV] = OLD_TEST_API_KEY
})

test('runDemoEditorAiMcp applies MCP edits to the current scene graph', async () => {
  process.env[TEST_API_KEY_ENV] = 'test-key'

  const bridge = new SceneBridge()
  bridge.loadDefault()
  const inputGraph = bridge.exportJSON()
  const level = Object.values(inputGraph.nodes).find((node) => node.type === 'level')
  expect(level).toBeDefined()

  const client = new ScriptedClient([
    {
      content: null,
      toolCalls: [
        {
          id: 'call_create_room',
          name: 'create_room',
          arguments: {
            levelId: level!.id,
            name: '会议室',
            polygon: [
              [0, 0],
              [5, 0],
              [5, 4],
              [0, 4],
            ],
          },
        },
      ],
    },
    {
      content: null,
      toolCalls: [
        {
          id: 'call_verify',
          name: 'verify_scene',
          arguments: {},
        },
      ],
    },
    {
      content: '已补一个会议室。',
      toolCalls: [],
    },
  ])

  const result = await runDemoEditorAiMcp(
    {
      prompt: '补一个会议室',
      projectName: 'Runtime smoke',
      sceneGraph: {
        nodes: inputGraph.nodes,
        rootNodeIds: inputGraph.rootNodeIds,
      },
      selectedNodeIds: [],
    },
    {
      getConfig: async () => ({
        ...DEFAULT_LLM_CONFIG,
        enabled: true,
        provider: 'openai',
        model: 'test-model',
        apiKeyEnvVar: TEST_API_KEY_ENV,
      }),
      createClient: () => client,
    },
  )

  expect(client.requestCount).toBe(3)
  expect(result.summary).toBe('已补一个会议室。')
  expect(result.toolCallCount).toBe(2)
  expect(result.toolTrace.map((entry) => entry.name)).toEqual(['create_room', 'verify_scene'])
  expect(Object.keys(result.sceneGraph.nodes).length).toBeGreaterThan(
    Object.keys(inputGraph.nodes).length,
  )
  expect(hasNodeNamed(result.sceneGraph, '会议室')).toBe(true)
})

class ScriptedClient implements LlmClient {
  private index = 0
  requestCount = 0

  constructor(private readonly completions: LlmCompletion[]) {}

  async complete(_request: LlmCompletionRequest): Promise<LlmCompletion> {
    this.requestCount++
    const completion = this.completions[this.index]
    this.index++
    if (!completion) return { content: 'done', toolCalls: [] }
    return completion
  }
}

function hasNodeNamed(sceneGraph: SceneGraph, name: string): boolean {
  return Object.values(sceneGraph.nodes).some((node) => node.name === name)
}
