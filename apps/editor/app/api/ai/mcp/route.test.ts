import { afterAll, afterEach, beforeEach, expect, mock, test } from 'bun:test'
import { useScene } from '@pascal-app/core'
import { SceneBridge } from '@pascal-app/mcp'

const OLD_ENV = { ...process.env }
const runEditorAiMcpMock = mock(async () => null)

mock.module('@/lib/ai/mcp', () => ({
  runEditorAiMcp: runEditorAiMcpMock,
}))

const routePromise = import('./route')

beforeEach(() => {
  runEditorAiMcpMock.mockReset()
  clearEditorAiEnv()
})

afterAll(() => {
  mock.restore()
})

afterEach(() => {
  restoreEnv('PASCAL_EDITOR_AI_API_KEY')
  restoreEnv('OPENAI_API_KEY')
  restoreEnv('DEEPSEEK_API_KEY')
  restoreEnv('PASCAL_EDITOR_AI_PROVIDER')
  restoreEnv('PASCAL_EDITOR_AI_BASE_URL')
  restoreEnv('PASCAL_EDITOR_AI_MODEL')
  restoreEnv('PASCAL_EDITOR_AI_TEMPERATURE')
  restoreEnv('PASCAL_EDITOR_AI_MAX_TOOL_ITERATIONS')
  useScene.getState().unloadScene()
})

test('returns prompt_required for blank prompts', async () => {
  const { POST } = await routePromise
  const response = await POST(makeRequest({ prompt: '   ', sceneGraph: makeValidSceneGraph() }))

  expect(response.status).toBe(400)
  expect(await response.json()).toEqual({ error: 'prompt_required' })
})

test('returns scene_snapshot_invalid for empty graphs', async () => {
  const { POST } = await routePromise
  const response = await POST(
    makeRequest({
      prompt: '补一个会议室',
      sceneGraph: {
        nodes: {},
        rootNodeIds: [],
      },
    }),
  )

  expect(response.status).toBe(400)
  expect(await response.json()).toEqual({ error: 'scene_snapshot_invalid' })
})

test('returns ai_api_key_missing when no editor AI key is configured', async () => {
  const { POST } = await routePromise
  const response = await POST(
    makeRequest({
      prompt: '补一个会议室',
      sceneGraph: makeValidSceneGraph(),
    }),
  )

  expect(response.status).toBe(503)
  expect(await response.json()).toEqual({ error: 'ai_api_key_missing' })
})

test('returns the runner payload on success', async () => {
  process.env.PASCAL_EDITOR_AI_API_KEY = 'secret'
  const requestGraph = makeValidSceneGraph()
  runEditorAiMcpMock.mockResolvedValueOnce({
    sceneGraph: requestGraph,
    summary: '已补好会议室和两扇门。',
    warnings: ['still worth checking door swing'],
    toolTrace: [
      {
        iteration: 0,
        toolCallId: 'call_1',
        name: 'create_room',
        arguments: { name: '会议室' },
        isError: false,
        result: { structuredContent: { ok: true } },
      },
    ],
    toolCallCount: 1,
  })

  const { POST } = await routePromise
  const response = await POST(
    makeRequest({
      prompt: '补一个会议室并补两扇门',
      sceneGraph: requestGraph,
      selectedNodeIds: [requestGraph.rootNodeIds[0] ?? 'missing-node', 'missing-node'],
      projectName: 'Demo Project',
    }),
  )

  const body = (await response.json()) as {
    summary: string
    warnings: string[]
    toolTrace: unknown[]
    toolCallCount: number
  }

  expect(response.status).toBe(200)
  expect(body.summary).toBe('已补好会议室和两扇门。')
  expect(body.warnings).toEqual(['still worth checking door swing'])
  expect(body.toolCallCount).toBe(1)
  expect(runEditorAiMcpMock).toHaveBeenCalledTimes(1)
  expect(runEditorAiMcpMock.mock.calls[0]?.[0]).toMatchObject({
    prompt: '补一个会议室并补两扇门',
    projectName: 'Demo Project',
    selectedNodeIds: [requestGraph.rootNodeIds[0]],
  })
})

test('maps scene validation failures to 422', async () => {
  process.env.PASCAL_EDITOR_AI_API_KEY = 'secret'
  runEditorAiMcpMock.mockRejectedValueOnce(new Error('scene_validation_failed:[{"nodeId":"x"}]'))

  const { POST } = await routePromise
  const response = await POST(
    makeRequest({
      prompt: '补一个会议室',
      sceneGraph: makeValidSceneGraph(),
    }),
  )

  expect(response.status).toBe(422)
  expect(await response.json()).toMatchObject({ error: 'scene_validation_failed' })
})

test('maps runner tool failures to 502', async () => {
  process.env.PASCAL_EDITOR_AI_API_KEY = 'secret'
  runEditorAiMcpMock.mockRejectedValueOnce(new Error('max_tool_iterations_exceeded'))

  const { POST } = await routePromise
  const response = await POST(
    makeRequest({
      prompt: '补一个会议室',
      sceneGraph: makeValidSceneGraph(),
    }),
  )

  expect(response.status).toBe(502)
  expect(await response.json()).toMatchObject({ error: 'ai_tool_failed' })
})

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/ai/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      host: 'localhost',
    },
    body: JSON.stringify(body),
  })
}

function makeValidSceneGraph() {
  const bridge = new SceneBridge()
  bridge.loadDefault()
  const graph = bridge.exportJSON()
  return {
    nodes: graph.nodes,
    rootNodeIds: graph.rootNodeIds,
    collections: graph.collections,
  }
}

function restoreEnv(key: keyof NodeJS.ProcessEnv): void {
  if (OLD_ENV[key] === undefined) delete process.env[key]
  else process.env[key] = OLD_ENV[key]
}

function clearEditorAiEnv(): void {
  delete process.env.PASCAL_EDITOR_AI_API_KEY
  delete process.env.OPENAI_API_KEY
  delete process.env.DEEPSEEK_API_KEY
  delete process.env.PASCAL_EDITOR_AI_PROVIDER
  delete process.env.PASCAL_EDITOR_AI_BASE_URL
  delete process.env.PASCAL_EDITOR_AI_MODEL
  delete process.env.PASCAL_EDITOR_AI_TEMPERATURE
  delete process.env.PASCAL_EDITOR_AI_MAX_TOOL_ITERATIONS
}
