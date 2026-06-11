import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import type {
  LlmTool,
  LlmToolCall,
  LlmToolTraceEntry,
  RunMcpToolLoopOptions,
  RunMcpToolLoopResult,
} from './types'

const DEFAULT_CLIENT_NAME = 'pascal-ai-agent'
const DEFAULT_CLIENT_VERSION = '0.1.0'

export async function runMcpToolLoop(
  options: RunMcpToolLoopOptions,
): Promise<RunMcpToolLoopResult> {
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair()
  const mcpClient = new Client({
    name: options.clientName ?? DEFAULT_CLIENT_NAME,
    version: options.clientVersion ?? DEFAULT_CLIENT_VERSION,
  })
  const allowedToolSet = new Set(options.allowedToolNames)
  const mutatingToolSet = new Set(options.mutatingToolNames ?? [])

  try {
    await Promise.all([options.server.connect(serverTransport), mcpClient.connect(clientTransport)])

    const tools = await listAllowedTools(mcpClient, allowedToolSet)
    if (tools.length === 0) {
      throw new Error('no_allowed_tools_available')
    }

    const messages = [...options.messages]
    const toolTrace: LlmToolTraceEntry[] = []
    let finalText = ''
    let toolCallCount = 0
    let didMutate = false

    for (let iteration = 0; iteration <= options.maxToolIterations; iteration++) {
      throwIfAborted(options.signal)

      const completion = await options.client.complete({
        model: options.model,
        messages,
        tools,
        temperature: options.temperature,
        ...(options.signal ? { signal: options.signal } : {}),
      })
      finalText = completion.content ?? finalText
      messages.push({
        role: 'assistant',
        content: completion.content,
        toolCalls: completion.toolCalls,
      })

      if (completion.toolCalls.length === 0) break
      if (iteration === options.maxToolIterations) {
        throw new Error('max_tool_iterations_exceeded')
      }

      for (const toolCall of completion.toolCalls) {
        assertAllowedTool(toolCall, allowedToolSet)
        toolCallCount++
        throwIfAborted(options.signal)

        const result = await mcpClient.callTool({
          name: toolCall.name,
          arguments: toolCall.arguments,
        })
        const isError = Boolean((result as { isError?: boolean }).isError)
        if (!isError && mutatingToolSet.has(toolCall.name)) {
          didMutate = true
        }
        toolTrace.push({
          iteration,
          toolCallId: toolCall.id,
          name: toolCall.name,
          arguments: toolCall.arguments,
          isError,
          result: simplifyToolResult(result),
        })
        messages.push({
          role: 'tool',
          toolCallId: toolCall.id,
          content: formatToolResultContent(result),
        })
      }
    }

    return {
      finalText,
      toolTrace,
      toolCallCount,
      didMutate,
    }
  } finally {
    await mcpClient.close().catch(() => undefined)
    await options.server.close().catch(() => undefined)
  }
}

async function listAllowedTools(client: Client, allowedToolSet: Set<string>): Promise<LlmTool[]> {
  const { tools } = await client.listTools()
  return tools
    .filter((tool) => allowedToolSet.has(tool.name))
    .map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        ...(tool.description ? { description: tool.description } : {}),
        parameters: normalizeParameters(tool.inputSchema),
      },
    }))
}

function assertAllowedTool(toolCall: LlmToolCall, allowedToolSet: Set<string>): void {
  if (!allowedToolSet.has(toolCall.name)) {
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

function simplifyToolResult(result: unknown): Record<string, unknown> {
  if (!result || typeof result !== 'object') {
    return { content: result }
  }

  const record = result as Record<string, unknown>
  return {
    isError: Boolean(record.isError),
    structuredContent: record.structuredContent,
    content: record.content,
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  const error = new Error('aborted')
  error.name = 'AbortError'
  throw error
}
