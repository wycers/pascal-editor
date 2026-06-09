import { expect, test } from 'bun:test'
import {
  DEFAULT_LLM_CONFIG,
  defaultBaseUrl,
  normalizeLlmConfigInput,
  publicLlmConfig,
  resolveRuntimeLlmConfig,
} from './config'

test('publicLlmConfig reports key availability without exposing the key', () => {
  const publicConfig = publicLlmConfig(DEFAULT_LLM_CONFIG, {
    DEEPSEEK_API_KEY: 'secret',
  } as NodeJS.ProcessEnv)

  expect(publicConfig.apiKeyConfigured).toBe(true)
  expect('apiKey' in publicConfig).toBe(false)
})

test('resolveRuntimeLlmConfig returns null when disabled or missing key', () => {
  expect(resolveRuntimeLlmConfig(DEFAULT_LLM_CONFIG, {} as NodeJS.ProcessEnv)).toBeNull()
  expect(
    resolveRuntimeLlmConfig(
      {
        ...DEFAULT_LLM_CONFIG,
        enabled: true,
      },
      {} as NodeJS.ProcessEnv,
    ),
  ).toBeNull()
})

test('resolveRuntimeLlmConfig resolves provider defaults', () => {
  const deepseek = resolveRuntimeLlmConfig(
    {
      ...DEFAULT_LLM_CONFIG,
      enabled: true,
    },
    { DEEPSEEK_API_KEY: 'secret' } as NodeJS.ProcessEnv,
  )

  expect(deepseek?.apiKey).toBe('secret')
  expect(deepseek?.resolvedBaseUrl).toBe('https://api.deepseek.com')
  expect(defaultBaseUrl('openai')).toBeUndefined()
})

test('normalizeLlmConfigInput accepts OpenAI settings', () => {
  const parsed = normalizeLlmConfigInput({
    enabled: true,
    provider: 'openai',
    model: 'gpt-5.5',
    baseUrl: null,
    apiKeyEnvVar: 'OPENAI_API_KEY',
    temperature: 0.2,
    maxToolIterations: 12,
    fallbackOnError: true,
  })

  expect(parsed.provider).toBe('openai')
  expect(parsed.apiKeyEnvVar).toBe('OPENAI_API_KEY')
})
