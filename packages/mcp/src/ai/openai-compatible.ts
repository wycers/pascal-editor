import type { LlmClient, LlmCompletion, LlmCompletionRequest, LlmMessage } from './types'

export type OpenAiCompatibleChatClientOptions = {
  apiKey: string
  baseURL?: string
}

type OpenAiToolCall = {
  id: string
  type: string
  function?: {
    name?: string
    arguments?: string
  }
}

type OpenAiChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: unknown
      tool_calls?: OpenAiToolCall[]
    }
  }>
}

export class OpenAiCompatibleChatClient implements LlmClient {
  private readonly apiKey: string
  private readonly baseURL: string

  constructor(options: OpenAiCompatibleChatClientOptions) {
    this.apiKey = options.apiKey
    this.baseURL = normalizeBaseUrl(options.baseURL ?? 'https://api.openai.com/v1')
  }

  async complete(request: LlmCompletionRequest): Promise<LlmCompletion> {
    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages.map(toOpenAiMessage),
        tools: request.tools,
        temperature: request.temperature,
        stream: false,
      }),
      signal: request.signal,
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`llm_http_error:${response.status}:${text.slice(0, 500)}`)
    }

    const body = (await response.json()) as OpenAiChatCompletionResponse
    const message = body.choices?.[0]?.message
    if (!message) {
      throw new Error('llm_empty_response')
    }

    return {
      content: typeof message.content === 'string' ? message.content : null,
      toolCalls: (message.tool_calls ?? []).flatMap((toolCall) =>
        toolCall.type === 'function' && toolCall.function?.name
          ? [
              {
                id: toolCall.id,
                name: toolCall.function.name,
                arguments: parseArguments(
                  toolCall.function.arguments ?? '',
                  toolCall.function.name,
                ),
              },
            ]
          : [],
      ),
    }
  }
}

function toOpenAiMessage(message: LlmMessage): Record<string, unknown> {
  if (message.role === 'tool') {
    return {
      role: 'tool',
      tool_call_id: message.toolCallId ?? '',
      content: message.content ?? '',
    }
  }

  if (message.role === 'assistant') {
    const assistant: Record<string, unknown> = {
      role: 'assistant',
      content: message.content,
    }

    if (message.toolCalls && message.toolCalls.length > 0) {
      assistant.tool_calls = message.toolCalls.map((toolCall) => ({
        id: toolCall.id,
        type: 'function',
        function: {
          name: toolCall.name,
          arguments: JSON.stringify(toolCall.arguments),
        },
      }))
    }

    return assistant
  }

  return {
    role: message.role,
    content: message.content ?? '',
  }
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '')
}

function parseArguments(raw: string, toolName: string): Record<string, unknown> {
  try {
    const parsed = raw ? JSON.parse(raw) : {}
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('arguments must be a JSON object')
    }
    return parsed as Record<string, unknown>
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`invalid_tool_arguments:${toolName}:${message}`)
  }
}
