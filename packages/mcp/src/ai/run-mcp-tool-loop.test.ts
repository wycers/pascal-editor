import { expect, test } from 'bun:test'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { runMcpToolLoop } from './run-mcp-tool-loop'
import type { LlmClient, LlmCompletion, LlmToolTraceEntry } from './types'

test('calls onToolTrace once per completed tool call without changing the final result', async () => {
  const server = makeEchoToolServer()
  const traceEntries: LlmToolTraceEntry[] = []

  const result = await runMcpToolLoop({
    server,
    client: makeClient([
      {
        content: null,
        toolCalls: [
          {
            id: 'call_echo',
            name: 'echo',
            arguments: { message: 'hello' },
          },
        ],
      },
      {
        content: 'done',
        toolCalls: [],
      },
    ]),
    model: 'test-model',
    temperature: 0,
    maxToolIterations: 2,
    messages: [],
    allowedToolNames: ['echo'],
    mutatingToolNames: ['echo'],
    onToolTrace: (entry) => {
      traceEntries.push(entry)
    },
  })

  expect(traceEntries).toHaveLength(1)
  expect(traceEntries[0]?.name).toBe('echo')
  expect(traceEntries[0]?.result.structuredContent).toEqual({ message: 'hello' })
  expect(result.finalText).toBe('done')
  expect(result.toolCallCount).toBe(1)
  expect(result.didMutate).toBe(true)
  expect(result.toolTrace).toEqual(traceEntries)
})

test('runs without onToolTrace', async () => {
  const result = await runMcpToolLoop({
    server: makeEchoToolServer(),
    client: makeClient([
      {
        content: 'done',
        toolCalls: [],
      },
    ]),
    model: 'test-model',
    temperature: 0,
    maxToolIterations: 1,
    messages: [],
    allowedToolNames: ['echo'],
  })

  expect(result.finalText).toBe('done')
  expect(result.toolCallCount).toBe(0)
  expect(result.toolTrace).toEqual([])
})

function makeEchoToolServer(): McpServer {
  const server = new McpServer({ name: 'test', version: '0.0.0' })
  server.registerTool(
    'echo',
    {
      title: 'Echo',
      inputSchema: {
        message: z.string(),
      },
      outputSchema: {
        message: z.string(),
      },
    },
    async ({ message }) => {
      const payload = { message }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
        structuredContent: payload,
      }
    },
  )
  return server
}

function makeClient(completions: LlmCompletion[]): LlmClient {
  return {
    async complete() {
      const completion = completions.shift()
      if (!completion) throw new Error('unexpected_completion_request')
      return completion
    },
  }
}
