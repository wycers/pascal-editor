import type { LlmClient } from './client'
import { defaultBaseUrl, type RuntimeLlmConfig } from './config'
import { OpenAiCompatibleChatClient } from './openai-compatible'

export function createLlmClient(config: RuntimeLlmConfig): LlmClient {
  return new OpenAiCompatibleChatClient({
    apiKey: config.apiKey,
    baseURL: config.resolvedBaseUrl ?? defaultBaseUrl(config.provider),
  })
}
