import { afterAll, beforeEach, expect, mock, test } from 'bun:test'
import { SceneBridge } from '@pascal-app/mcp'

const runDemoEditorAiMcpMock = mock(async () => null)

mock.module('@/lib/ai/mcp', () => ({
  runDemoEditorAiMcp: runDemoEditorAiMcpMock,
}))

const routePromise = import('./route')

beforeEach(() => {
  runDemoEditorAiMcpMock.mockReset()
})

afterAll(() => {
  mock.restore()
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

test('returns ai_api_key_missing when the demo LLM config is unavailable', async () => {
  runDemoEditorAiMcpMock.mockRejectedValueOnce(
    new Error('ai_api_key_missing:missing_env:OPENAI_API_KEY'),
  )

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
  const requestGraph = makeValidSceneGraph()
  runDemoEditorAiMcpMock.mockResolvedValueOnce({
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
  expect(runDemoEditorAiMcpMock).toHaveBeenCalledTimes(1)
  expect(runDemoEditorAiMcpMock.mock.calls[0]?.[0]).toMatchObject({
    prompt: '补一个会议室并补两扇门',
    projectName: 'Demo Project',
    selectedNodeIds: [requestGraph.rootNodeIds[0]],
  })
})

test('maps scene validation failures to 422', async () => {
  runDemoEditorAiMcpMock.mockRejectedValueOnce(
    new Error('scene_validation_failed:[{"nodeId":"x"}]'),
  )

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
  runDemoEditorAiMcpMock.mockRejectedValueOnce(new Error('max_tool_iterations_exceeded'))

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
