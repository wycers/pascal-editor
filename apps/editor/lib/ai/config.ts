export type EditorAiProvider = 'openai' | 'deepseek'

export type EditorAiRuntimeConfig = {
  provider: EditorAiProvider
  model: string
  apiKey: string
  apiKeyEnvVar: string
  baseURL?: string
  temperature: number
  maxToolIterations: number
}

const DEFAULT_DEEPSEEK_MODEL = 'deepseek-v4-pro'
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini'
const DEFAULT_TEMPERATURE = 0.2
const DEFAULT_MAX_TOOL_ITERATIONS = 8

export function resolveEditorAiRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): EditorAiRuntimeConfig | null {
  const provider = resolveProvider(env)
  const apiKeyEnvVar = resolveApiKeyEnvVar(env, provider)
  const apiKey = apiKeyEnvVar ? env[apiKeyEnvVar] : undefined
  if (!apiKeyEnvVar || !apiKey) return null

  const model = normalizeModel(
    env.PASCAL_EDITOR_AI_MODEL,
    provider === 'deepseek' ? DEFAULT_DEEPSEEK_MODEL : DEFAULT_OPENAI_MODEL,
  )

  return {
    provider,
    model,
    apiKey,
    apiKeyEnvVar,
    ...(env.PASCAL_EDITOR_AI_BASE_URL
      ? { baseURL: env.PASCAL_EDITOR_AI_BASE_URL }
      : provider === 'deepseek'
        ? { baseURL: 'https://api.deepseek.com' }
        : {}),
    temperature: normalizeTemperature(env.PASCAL_EDITOR_AI_TEMPERATURE),
    maxToolIterations: normalizeMaxToolIterations(env.PASCAL_EDITOR_AI_MAX_TOOL_ITERATIONS),
  }
}

function resolveProvider(env: NodeJS.ProcessEnv): EditorAiProvider {
  const explicit = env.PASCAL_EDITOR_AI_PROVIDER
  if (explicit === 'openai' || explicit === 'deepseek') return explicit
  if (env.DEEPSEEK_API_KEY) return 'deepseek'
  if (env.OPENAI_API_KEY) return 'openai'
  return 'deepseek'
}

function resolveApiKeyEnvVar(env: NodeJS.ProcessEnv, provider: EditorAiProvider): string | null {
  if (env.PASCAL_EDITOR_AI_API_KEY) return 'PASCAL_EDITOR_AI_API_KEY'
  if (provider === 'deepseek' && env.DEEPSEEK_API_KEY) return 'DEEPSEEK_API_KEY'
  if (provider === 'openai' && env.OPENAI_API_KEY) return 'OPENAI_API_KEY'
  return null
}

function normalizeModel(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim()
  return trimmed ? trimmed : fallback
}

function normalizeTemperature(value: string | undefined): number {
  const parsed = Number.parseFloat(value ?? '')
  if (!Number.isFinite(parsed)) return DEFAULT_TEMPERATURE
  return Math.min(2, Math.max(0, parsed))
}

function normalizeMaxToolIterations(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '', 10)
  if (!Number.isFinite(parsed)) return DEFAULT_MAX_TOOL_ITERATIONS
  return Math.min(30, Math.max(1, parsed))
}
