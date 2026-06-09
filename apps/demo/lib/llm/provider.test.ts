import { expect, test } from 'bun:test'
import { DEFAULT_LLM_CONFIG, type RuntimeLlmConfig } from './config'
import { createLlmClient } from './provider'

test('createLlmClient returns a Chat Completions client for OpenAI-compatible providers', () => {
  const config: RuntimeLlmConfig = {
    ...DEFAULT_LLM_CONFIG,
    enabled: true,
    apiKey: 'test-key',
    resolvedBaseUrl: 'https://api.deepseek.com',
  }

  const client = createLlmClient(config)

  expect(typeof client.complete).toBe('function')
})
