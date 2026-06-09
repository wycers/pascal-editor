import { eq } from 'drizzle-orm'
import { ensureDemoDatabase } from '@/lib/db/client'
import { demoLlmConfig } from '@/lib/db/schema'
import {
  DEFAULT_LLM_CONFIG,
  LLM_CONFIG_ID,
  type NormalizedLlmConfigInput,
  type StoredLlmConfig,
} from './config'

type LlmConfigRow = typeof demoLlmConfig.$inferSelect

export async function getLlmConfig(): Promise<StoredLlmConfig> {
  const db = await ensureDemoDatabase()
  const [row] = await db
    .select()
    .from(demoLlmConfig)
    .where(eq(demoLlmConfig.id, LLM_CONFIG_ID))
    .limit(1)
  return row ? rowToConfig(row) : DEFAULT_LLM_CONFIG
}

export async function saveLlmConfig(input: NormalizedLlmConfigInput): Promise<StoredLlmConfig> {
  const db = await ensureDemoDatabase()
  const now = new Date()
  const values = {
    id: LLM_CONFIG_ID,
    enabled: input.enabled,
    provider: input.provider,
    model: input.model,
    baseUrl: input.baseUrl ?? null,
    apiKeyEnvVar: input.apiKeyEnvVar,
    temperature: input.temperature,
    maxToolIterations: input.maxToolIterations,
    fallbackOnError: input.fallbackOnError,
    createdAt: now,
    updatedAt: now,
  }

  const [saved] = await db
    .insert(demoLlmConfig)
    .values(values)
    .onConflictDoUpdate({
      target: demoLlmConfig.id,
      set: {
        enabled: values.enabled,
        provider: values.provider,
        model: values.model,
        baseUrl: values.baseUrl,
        apiKeyEnvVar: values.apiKeyEnvVar,
        temperature: values.temperature,
        maxToolIterations: values.maxToolIterations,
        fallbackOnError: values.fallbackOnError,
        updatedAt: now,
      },
    })
    .returning()

  if (!saved) {
    throw new Error('Failed to save LLM config')
  }
  return rowToConfig(saved)
}

function rowToConfig(row: LlmConfigRow): StoredLlmConfig {
  return {
    id: row.id,
    enabled: row.enabled,
    provider: row.provider as StoredLlmConfig['provider'],
    model: row.model,
    baseUrl: row.baseUrl,
    apiKeyEnvVar: row.apiKeyEnvVar,
    temperature: row.temperature,
    maxToolIterations: row.maxToolIterations,
    fallbackOnError: row.fallbackOnError,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
