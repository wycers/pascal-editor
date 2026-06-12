import { afterEach, expect, mock, test } from 'bun:test'
import { SceneBridge } from '@pascal-app/mcp'
import { runEditorAiMcp } from './mcp'
import type { EditorAiStreamEvent } from './stream-events'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

test('runEditorAiMcp applies MCP edits to the current scene graph', async () => {
  const bridge = new SceneBridge()
  bridge.loadDefault()
  const inputGraph = bridge.exportJSON()
  const level = Object.values(inputGraph.nodes).find((node) => node.type === 'level')
  expect(level).toBeDefined()

  const fetchMock = mock(async () => {
    const response = completionResponses.shift()
    if (!response) {
      throw new Error('unexpected_completion_request')
    }
    return new Response(JSON.stringify(response), {
      headers: { 'content-type': 'application/json' },
      status: 200,
    })
  })
  globalThis.fetch = fetchMock as unknown as typeof fetch

  const completionResponses = [
    chatCompletion({
      content: null,
      tool_calls: [
        {
          id: 'call_create_room',
          type: 'function',
          function: {
            name: 'create_room',
            arguments: JSON.stringify({
              levelId: level!.id,
              name: '会议室',
              polygon: [
                [0, 0],
                [5, 0],
                [5, 4],
                [0, 4],
              ],
            }),
          },
        },
      ],
    }),
    chatCompletion({
      content: null,
      tool_calls: [
        {
          id: 'call_verify',
          type: 'function',
          function: {
            name: 'verify_scene',
            arguments: '{}',
          },
        },
      ],
    }),
    chatCompletion({
      content: '已补一个会议室。',
      tool_calls: [],
    }),
  ]
  const streamEvents: EditorAiStreamEvent[] = []

  const result = await runEditorAiMcp(
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
      PASCAL_EDITOR_AI_API_KEY: 'test-key',
      PASCAL_EDITOR_AI_PROVIDER: 'openai',
      PASCAL_EDITOR_AI_MODEL: 'test-model',
    },
    {
      stream: (event) => {
        streamEvents.push(event)
      },
    },
  )

  expect(fetchMock).toHaveBeenCalledTimes(3)
  expect(result.summary).toBe('已补一个会议室。')
  expect(result.toolCallCount).toBe(2)
  expect(result.toolTrace.map((entry) => entry.name)).toEqual(['create_room', 'verify_scene'])
  expect(Object.keys(result.sceneGraph.nodes).length).toBeGreaterThan(
    Object.keys(inputGraph.nodes).length,
  )
  expect(Object.values(result.sceneGraph.nodes).some((node) => node.name === '会议室')).toBe(true)
  expect(streamEvents.map((event) => event.type)).toEqual(['tool', 'scene', 'tool', 'final'])
  const sceneEvent = streamEvents.find((event) => event.type === 'scene')
  expect(sceneEvent?.toolName).toBe('create_room')
  expect(Object.keys(sceneEvent?.sceneGraph.nodes ?? {}).length).toBeGreaterThan(
    Object.keys(inputGraph.nodes).length,
  )
})

function chatCompletion(message: {
  content: string | null
  tool_calls: Array<{
    id: string
    type: 'function'
    function: {
      name: string
      arguments: string
    }
  }>
}) {
  return {
    choices: [
      {
        message,
      },
    ],
  }
}
