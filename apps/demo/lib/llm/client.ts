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
}

export type LlmCompletion = {
  content: string | null
  toolCalls: LlmToolCall[]
}

export interface LlmClient {
  complete(request: LlmCompletionRequest): Promise<LlmCompletion>
}
