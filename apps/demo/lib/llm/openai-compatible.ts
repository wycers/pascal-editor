import OpenAI from 'openai'
import type {
  ChatCompletionAssistantMessageParam,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions'
import type { LlmClient, LlmCompletion, LlmCompletionRequest, LlmMessage } from './client'

export type OpenAiCompatibleChatClientOptions = {
  apiKey: string
  baseURL?: string
}

export class OpenAiCompatibleChatClient implements LlmClient {
  private readonly client: OpenAI

  constructor(options: OpenAiCompatibleChatClientOptions) {
    this.client = new OpenAI({
      apiKey: options.apiKey,
      ...(options.baseURL ? { baseURL: options.baseURL } : {}),
    })
  }

  async complete(request: LlmCompletionRequest): Promise<LlmCompletion> {
    const response = await this.client.chat.completions.create(
      {
        model: request.model,
        messages: request.messages.map(toOpenAiMessage),
        tools: request.tools as ChatCompletionTool[],
        temperature: request.temperature,
        stream: false,
      },
      request.signal ? { signal: request.signal } : undefined,
    )

    const message = response.choices[0]?.message
    if (!message) {
      throw new Error('llm_empty_response')
    }

    return {
      content: typeof message.content === 'string' ? message.content : null,
      toolCalls: (message.tool_calls ?? []).flatMap((toolCall) =>
        toolCall.type === 'function'
          ? [
              {
                id: toolCall.id,
                name: toolCall.function.name,
                arguments: parseArguments(toolCall.function.arguments, toolCall.function.name),
              },
            ]
          : [],
      ),
    }
  }
}

function toOpenAiMessage(message: LlmMessage): ChatCompletionMessageParam {
  if (message.role === 'tool') {
    return {
      role: 'tool',
      tool_call_id: message.toolCallId ?? '',
      content: message.content ?? '',
    }
  }

  if (message.role === 'assistant') {
    const assistant: ChatCompletionAssistantMessageParam = {
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
