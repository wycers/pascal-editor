import { z } from 'zod'

export const LLM_CONFIG_ID = 'default'

export const LLM_PROVIDERS = ['openai', 'deepseek'] as const
export type LlmProvider = (typeof LLM_PROVIDERS)[number]

export const DEFAULT_LLM_CONFIG = {
  id: LLM_CONFIG_ID,
  enabled: false,
  provider: 'deepseek' as LlmProvider,
  model: 'deepseek-v4-pro',
  baseUrl: null as string | null,
  apiKeyEnvVar: 'DEEPSEEK_API_KEY',
  temperature: 0.2,
  maxToolIterations: 12,
  fallbackOnError: true,
}

export const llmConfigInputSchema = z.object({
  enabled: z.boolean(),
  provider: z.enum(LLM_PROVIDERS),
  model: z.string().trim().min(1).max(200),
  baseUrl: z
    .string()
    .trim()
    .url()
    .nullable()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null)),
  apiKeyEnvVar: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[A-Z][A-Z0-9_]*$/),
  temperature: z.number().min(0).max(2),
  maxToolIterations: z.number().int().min(1).max(30),
  fallbackOnError: z.boolean(),
})

export type LlmConfigInput = z.input<typeof llmConfigInputSchema>
export type NormalizedLlmConfigInput = z.output<typeof llmConfigInputSchema>

export type StoredLlmConfig = typeof DEFAULT_LLM_CONFIG & {
  createdAt?: string
  updatedAt?: string
}

export type PublicLlmConfig = StoredLlmConfig & {
  apiKeyConfigured: boolean
}

export type RuntimeLlmConfig = StoredLlmConfig & {
  apiKey: string
  resolvedBaseUrl: string | undefined
}

export function defaultBaseUrl(provider: LlmProvider): string | undefined {
  return provider === 'deepseek' ? 'https://api.deepseek.com' : undefined
}

export function normalizeLlmConfigInput(input: LlmConfigInput): NormalizedLlmConfigInput {
  return llmConfigInputSchema.parse(input)
}

export function publicLlmConfig(
  config: StoredLlmConfig,
  env: NodeJS.ProcessEnv = process.env,
): PublicLlmConfig {
  return {
    ...config,
    apiKeyConfigured: Boolean(env[config.apiKeyEnvVar]),
  }
}

export function resolveRuntimeLlmConfig(
  config: StoredLlmConfig,
  env: NodeJS.ProcessEnv = process.env,
): RuntimeLlmConfig | null {
  if (!config.enabled) return null
  const apiKey = env[config.apiKeyEnvVar]
  if (!apiKey) return null
  return {
    ...config,
    apiKey,
    resolvedBaseUrl: config.baseUrl ?? defaultBaseUrl(config.provider),
  }
}

export function runtimeConfigMissingReason(config: StoredLlmConfig): string {
  if (!config.enabled) return 'llm_disabled'
  if (!process.env[config.apiKeyEnvVar]) return `missing_env:${config.apiKeyEnvVar}`
  return 'llm_unavailable'
}
