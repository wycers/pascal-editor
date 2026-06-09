import { afterAll, afterEach, beforeEach, expect, mock, test } from 'bun:test'
import { DEFAULT_LLM_CONFIG } from '@/lib/llm/config'

const OLD_ENV = { ...process.env }
let savedConfig: unknown = null

beforeEach(() => {
  savedConfig = null
  mock.module('@/lib/llm/config-store', () => ({
    getLlmConfig: async () => ({
      ...DEFAULT_LLM_CONFIG,
      enabled: true,
    }),
    saveLlmConfig: async (input: unknown) => {
      savedConfig = input
      return {
        ...DEFAULT_LLM_CONFIG,
        ...(input as object),
      }
    },
  }))
})

afterAll(() => {
  mock.restore()
})

afterEach(() => {
  restoreEnv('PASCAL_DEMO_ADMIN_TOKEN')
  restoreEnv('DEEPSEEK_API_KEY')
})

test('GET /api/admin/llm-config rejects missing admin token configuration', async () => {
  delete process.env.PASCAL_DEMO_ADMIN_TOKEN
  const { GET } = await import('./route')

  const response = await GET(new Request('https://demo.example/api/admin/llm-config') as never)

  expect(response.status).toBe(503)
  expect(await response.json()).toEqual({ error: 'admin_token_required' })
})

test('GET /api/admin/llm-config returns public config without API key value', async () => {
  process.env.PASCAL_DEMO_ADMIN_TOKEN = 'admin'
  process.env.DEEPSEEK_API_KEY = 'secret'
  const { GET } = await import('./route')

  const response = await GET(
    new Request('https://demo.example/api/admin/llm-config', {
      headers: { authorization: 'Bearer admin' },
    }) as never,
  )
  const body = (await response.json()) as { config: Record<string, unknown> }

  expect(response.status).toBe(200)
  expect(body.config.apiKeyConfigured).toBe(true)
  expect(body.config.apiKey).toBeUndefined()
})

test('PUT /api/admin/llm-config validates and saves public config fields', async () => {
  process.env.PASCAL_DEMO_ADMIN_TOKEN = 'admin'
  const { PUT } = await import('./route')

  const response = await PUT(
    new Request('https://demo.example/api/admin/llm-config', {
      method: 'PUT',
      headers: {
        authorization: 'Bearer admin',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        enabled: true,
        provider: 'openai',
        model: 'gpt-5.5',
        baseUrl: null,
        apiKeyEnvVar: 'OPENAI_API_KEY',
        temperature: 0.2,
        maxToolIterations: 12,
        fallbackOnError: true,
      }),
    }) as never,
  )

  expect(response.status).toBe(200)
  expect((savedConfig as { provider?: string } | null)?.provider).toBe('openai')
})

function restoreEnv(key: keyof NodeJS.ProcessEnv): void {
  if (OLD_ENV[key] === undefined) delete process.env[key]
  else process.env[key] = OLD_ENV[key]
}
