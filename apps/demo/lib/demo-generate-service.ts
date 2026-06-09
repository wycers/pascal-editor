import type { SceneStore } from '@pascal-app/mcp/storage/types'
import { computeDemoSceneMetrics } from '@/lib/demo-metrics'
import { generateDemoSceneFromBrief } from '@/lib/demo-scene'
import type { LlmClient } from '@/lib/llm/client'
import type { RuntimeLlmConfig } from '@/lib/llm/config'
import {
  resolveRuntimeLlmConfig,
  runtimeConfigMissingReason,
  type StoredLlmConfig,
} from '@/lib/llm/config'
import { getLlmConfig } from '@/lib/llm/config-store'
import { type PascalAgentGenerationResult, runPascalAgentGeneration } from '@/lib/llm/pascal-agent'
import { createLlmClient } from '@/lib/llm/provider'
import { getSceneStore } from '@/lib/scene-store-server'

export type DemoGenerateInput = {
  brief: string
  projectName?: string
  constraints?: string
}

export type DemoGeneratePayload = {
  sceneId: string
  sceneUrl: string
  nodeCount: number
  roomCount: number
  validation: {
    valid: boolean
    errors: string[]
  }
  limitations: string[]
  projectName: string
  summary: string
  metrics: ReturnType<typeof computeDemoSceneMetrics>
  generator: 'llm' | 'deterministic'
  provider?: StoredLlmConfig['provider']
  model?: string
  toolCallCount?: number
  fallbackReason?: string
}

export async function generateDemoPayload(input: DemoGenerateInput): Promise<DemoGeneratePayload> {
  return generateDemoPayloadWithDeps(input)
}

export type DemoGenerateDeps = {
  getConfig?: () => Promise<StoredLlmConfig>
  getStore?: () => Promise<SceneStore>
  createClient?: (config: RuntimeLlmConfig) => LlmClient
  runAgent?: (options: {
    input: DemoGenerateInput
    config: RuntimeLlmConfig
    store: SceneStore
    client: LlmClient
  }) => Promise<PascalAgentGenerationResult>
}

export async function generateDemoPayloadWithDeps(
  input: DemoGenerateInput,
  deps: DemoGenerateDeps = {},
): Promise<DemoGeneratePayload> {
  const config = await (deps.getConfig ?? getLlmConfig)()
  const runtimeConfig = resolveRuntimeLlmConfig(config)

  if (runtimeConfig) {
    try {
      const store = await (deps.getStore ?? getSceneStore)()
      const result = await (deps.runAgent ?? runPascalAgentGeneration)({
        input,
        config: runtimeConfig,
        store,
        client: (deps.createClient ?? createLlmClient)(runtimeConfig),
      })
      const metrics = computeDemoSceneMetrics(result.sceneGraph)
      return {
        sceneId: result.meta.id,
        sceneUrl: `/scene/${result.meta.id}?demo=1`,
        nodeCount: metrics.sourceNodeCount,
        roomCount: metrics.roomCount,
        validation: {
          valid: true,
          errors: [],
        },
        limitations: ['LLM/MCP 生成结果适合方案演示；面积、BOM 和模块化率仍需工程复核。'],
        projectName: result.meta.name,
        summary: result.summary,
        metrics,
        generator: 'llm',
        provider: result.provider,
        model: result.model,
        toolCallCount: result.toolCallCount,
      }
    } catch (error) {
      if (!config.fallbackOnError) throw error
      return generateDeterministicPayload(input, errorMessage(error), deps)
    }
  }

  if (config.enabled && !config.fallbackOnError) {
    throw new Error(runtimeConfigMissingReason(config))
  }

  return generateDeterministicPayload(
    input,
    config.enabled ? runtimeConfigMissingReason(config) : undefined,
    deps,
  )
}

async function generateDeterministicPayload(
  input: DemoGenerateInput,
  fallbackReason?: string,
  deps: Pick<DemoGenerateDeps, 'getStore'> = {},
): Promise<DemoGeneratePayload> {
  const generated = generateDemoSceneFromBrief(input)
  const store = await (deps.getStore ?? getSceneStore)()
  const meta = await store.save({
    name: generated.projectName,
    projectId: 'demo',
    graph: generated.sceneGraph,
    saveMode: 'checkpoint',
    publish: true,
    operation: 'demo_generate',
  })

  if (store.appendSceneEvent) {
    await store.appendSceneEvent({
      sceneId: meta.id,
      version: meta.version,
      kind: 'demo_generate',
      graph: generated.sceneGraph,
    })
  }

  const metrics = computeDemoSceneMetrics(generated.sceneGraph)
  return {
    sceneId: meta.id,
    sceneUrl: `/scene/${meta.id}?demo=1`,
    nodeCount: metrics.sourceNodeCount,
    roomCount: metrics.roomCount,
    validation: {
      valid: true,
      errors: [],
    },
    limitations: generated.limitations,
    projectName: generated.projectName,
    summary: generated.summary,
    metrics,
    generator: 'deterministic',
    ...(fallbackReason ? { fallbackReason } : {}),
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
