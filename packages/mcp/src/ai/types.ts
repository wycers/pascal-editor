export type LlmRole = 'system' | 'user' | 'assistant' | 'tool'

export type LlmMessage = {
  role: LlmRole
  content: string | null
  toolCallId?: string
  toolCalls?: LlmToolCall[]
}

export type LlmTool = {
  type: 'function'
  function: {
    name: string
    description?: string
    parameters: Record<string, unknown>
  }
}

export type LlmToolCall = {
  id: string
  name: string
  arguments: Record<string, unknown>
}

export type LlmCompletionRequest = {
  model: string
  messages: LlmMessage[]
  tools: LlmTool[]
  temperature: number
  signal?: AbortSignal
}

export type LlmCompletion = {
  content: string | null
  toolCalls: LlmToolCall[]
}

export interface LlmClient {
  complete(request: LlmCompletionRequest): Promise<LlmCompletion>
}

export type LlmToolTraceEntry = {
  iteration: number
  toolCallId: string
  name: string
  arguments: Record<string, unknown>
  isError: boolean
  result: {
    content?: unknown
    structuredContent?: unknown
    text?: string
  }
}

export type RunMcpToolLoopOptions = {
  server: import('@modelcontextprotocol/sdk/server/mcp.js').McpServer
  client: LlmClient
  model: string
  temperature: number
  maxToolIterations: number
  messages: LlmMessage[]
  allowedToolNames: readonly string[]
  mutatingToolNames?: readonly string[]
  signal?: AbortSignal
  clientName?: string
  clientVersion?: string
  onToolTrace?: (entry: LlmToolTraceEntry) => void | Promise<void>
}

export type RunMcpToolLoopResult = {
  finalText: string
  toolTrace: LlmToolTraceEntry[]
  toolCallCount: number
  didMutate: boolean
}
