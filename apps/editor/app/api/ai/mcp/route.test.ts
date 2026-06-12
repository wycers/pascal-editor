import { afterAll, afterEach, beforeEach, expect, mock, test } from 'bun:test'
import { useScene } from '@pascal-app/core'
import { SceneBridge } from '@pascal-app/mcp'

const OLD_ENV = { ...process.env }
const runEditorAiMcpMock = mock(async () => null)

mock.module('@/lib/ai/mcp', () => ({
  mapEditorAiErrorPayload: mapEditorAiErrorPayloadForTest,
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

test('streams tool, scene, and final events when requested', async () => {
  process.env.PASCAL_EDITOR_AI_API_KEY = 'secret'
  const requestGraph = makeValidSceneGraph()
  runEditorAiMcpMock.mockImplementationOnce(async (_input, _env, options) => {
    await options.stream({
      type: 'tool',
      entry: {
        iteration: 0,
        toolCallId: 'call_1',
        name: 'create_room',
        arguments: { name: '会议室' },
        isError: false,
        result: { structuredContent: { ok: true } },
      },
    })
    await options.stream({
      type: 'scene',
      sceneGraph: requestGraph,
      toolCallId: 'call_1',
      toolName: 'create_room',
    })
    await options.stream({
      type: 'final',
      sceneGraph: requestGraph,
      summary: '已补好会议室。',
      warnings: [],
      toolTrace: [],
      toolCallCount: 1,
    })
    return {
      sceneGraph: requestGraph,
      summary: '已补好会议室。',
      warnings: [],
      toolTrace: [],
      toolCallCount: 1,
    }
  })

  const { POST } = await routePromise
  const response = await POST(
    makeRequest({
      prompt: '补一个会议室',
      sceneGraph: requestGraph,
      stream: true,
    }),
  )

  const events = await readSseEvents(response)

  expect(response.status).toBe(200)
  expect(response.headers.get('content-type')).toContain('text/event-stream')
  expect(events.map((event) => event.event)).toEqual(['tool', 'scene', 'final'])
  expect(events[0]?.data.type).toBe('tool')
  expect(events[1]?.data).toMatchObject({ sceneGraph: { rootNodeIds: requestGraph.rootNodeIds } })
  expect(events[2]?.data.summary).toBe('已补好会议室。')
  const runOptions = runEditorAiMcpMock.mock.calls[0]?.[2] as { signal?: AbortSignal }
  expect(runOptions.signal).toBeInstanceOf(AbortSignal)
})

test('streams mapped errors when the runner rejects before emitting a terminal event', async () => {
  process.env.PASCAL_EDITOR_AI_API_KEY = 'secret'
  runEditorAiMcpMock.mockRejectedValueOnce(new Error('max_tool_iterations_exceeded'))

  const { POST } = await routePromise
  const response = await POST(
    makeRequest({
      prompt: '补一个会议室',
      sceneGraph: makeValidSceneGraph(),
      stream: true,
    }),
  )

  const events = await readSseEvents(response)

  expect(response.status).toBe(200)
  expect(events).toHaveLength(1)
  expect(events[0]).toMatchObject({
    event: 'error',
    data: {
      type: 'error',
      status: 502,
      error: 'ai_tool_failed',
      message: 'max_tool_iterations_exceeded',
    },
  })
})

test('closes the stream when the request is aborted', async () => {
  process.env.PASCAL_EDITOR_AI_API_KEY = 'secret'
  const controller = new AbortController()
  runEditorAiMcpMock.mockImplementationOnce(
    async (_input, _env, options) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener(
          'abort',
          () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
          { once: true },
        )
      }),
  )

  const { POST } = await routePromise
  const response = await POST(
    makeRequest(
      {
        prompt: '补一个会议室',
        sceneGraph: makeValidSceneGraph(),
        stream: true,
      },
      controller.signal,
    ),
  )

  const reader = response.body?.getReader()
  expect(reader).toBeDefined()
  await reader!.read()
  controller.abort()
  const next = await reader!.read()

  expect(next.done).toBe(true)
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

function makeRequest(body: unknown, signal?: AbortSignal): Request {
  return new Request('http://localhost/api/ai/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      host: 'localhost',
    },
    body: JSON.stringify(body),
    signal,
  })
}

async function readSseEvents(
  response: Response,
): Promise<Array<{ event: string; data: Record<string, unknown> }>> {
  const text = await response.text()
  return text
    .split('\n\n')
    .map((frame) => frame.trim())
    .filter(Boolean)
    .flatMap((frame) => {
      const event = frame
        .split('\n')
        .find((line) => line.startsWith('event: '))
        ?.slice('event: '.length)
      const data = frame
        .split('\n')
        .filter((line) => line.startsWith('data: '))
        .map((line) => line.slice('data: '.length))
        .join('\n')
      return event && data ? [{ event, data: JSON.parse(data) as Record<string, unknown> }] : []
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

function mapEditorAiErrorPayloadForTest(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)

  if (message.startsWith('scene_validation_failed:')) {
    return { status: 422, body: { error: 'scene_validation_failed', message } }
  }

  if (message === 'max_tool_iterations_exceeded') {
    return { status: 502, body: { error: 'ai_tool_failed', message } }
  }

  if (message === 'aborted' || message === 'AbortError') {
    return { status: 499, body: { error: 'request_aborted' } }
  }

  return { status: 500, body: { error: 'ai_mcp_failed', message } }
}
