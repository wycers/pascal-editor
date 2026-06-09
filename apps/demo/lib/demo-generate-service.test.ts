import { afterEach, expect, test } from 'bun:test'
import type { SceneMeta, SceneStore } from '@pascal-app/mcp/storage/types'
import { generateDemoPayloadWithDeps } from './demo-generate-service'
import { generateDemoSceneFromBrief } from './demo-scene'
import { DEFAULT_LLM_CONFIG } from './llm/config'

const OLD_ENV = { ...process.env }

afterEach(() => {
  restoreEnv('DEEPSEEK_API_KEY')
})

test('generateDemoPayloadWithDeps uses deterministic generation when LLM is disabled', async () => {
  const payload = await generateDemoPayloadWithDeps(
    { brief: '生成两层办公楼', projectName: 'Office' },
    {
      getConfig: async () => DEFAULT_LLM_CONFIG,
      getStore: async () => makeStore(),
    },
  )

  expect(payload.generator).toBe('deterministic')
  expect(payload.sceneUrl).toContain('/scene/')
  expect(payload.roomCount).toBeGreaterThan(0)
})

test('generateDemoPayloadWithDeps returns LLM metadata on agent success', async () => {
  process.env.DEEPSEEK_API_KEY = 'secret'
  const generated = generateDemoSceneFromBrief({ brief: '生成民宿' })
  const payload = await generateDemoPayloadWithDeps(
    { brief: '生成民宿', projectName: 'LLM Scene' },
    {
      getConfig: async () => ({
        ...DEFAULT_LLM_CONFIG,
        enabled: true,
      }),
      getStore: async () => makeStore(),
      createClient: () => ({ complete: async () => ({ content: null, toolCalls: [] }) }),
      runAgent: async () => ({
        meta: makeMeta({
          id: 'llm-scene',
          name: 'LLM Scene',
          version: 1,
          nodeCount: Object.keys(generated.sceneGraph.nodes).length,
        }),
        sceneGraph: generated.sceneGraph,
        summary: 'LLM summary',
        toolCallCount: 3,
        provider: 'deepseek',
        model: 'deepseek-v4-pro',
      }),
    },
  )

  expect(payload.generator).toBe('llm')
  expect(payload.provider).toBe('deepseek')
  expect(payload.toolCallCount).toBe(3)
})

test('generateDemoPayloadWithDeps falls back when the agent fails and fallback is enabled', async () => {
  process.env.DEEPSEEK_API_KEY = 'secret'
  const payload = await generateDemoPayloadWithDeps(
    { brief: '生成两层办公楼', projectName: 'Office' },
    {
      getConfig: async () => ({
        ...DEFAULT_LLM_CONFIG,
        enabled: true,
      }),
      getStore: async () => makeStore(),
      createClient: () => ({ complete: async () => ({ content: null, toolCalls: [] }) }),
      runAgent: async () => {
        throw new Error('agent_failed')
      },
    },
  )

  expect(payload.generator).toBe('deterministic')
  expect(payload.fallbackReason).toBe('agent_failed')
})

function makeStore(): SceneStore {
  return {
    backend: 'postgres',
    save: async (opts) =>
      makeMeta({
        id: opts.id ?? 'scene',
        name: opts.name,
        version: 1,
        nodeCount: Object.keys(opts.graph.nodes).length,
      }),
    load: async () => null,
    list: async () => [],
    delete: async () => false,
    rename: async (_id, name) => makeMeta({ id: 'scene', name, version: 1, nodeCount: 0 }),
    appendSceneEvent: async (opts) => ({
      eventId: 1,
      sceneId: opts.sceneId,
      version: opts.version,
      kind: opts.kind,
      createdAt: new Date().toISOString(),
      graph: opts.graph,
    }),
  }
}

function makeMeta(opts: {
  id: string
  name: string
  version: number
  nodeCount: number
}): SceneMeta {
  const now = new Date().toISOString()
  return {
    id: opts.id,
    name: opts.name,
    projectId: 'demo',
    thumbnailUrl: null,
    version: opts.version,
    createdAt: now,
    updatedAt: now,
    ownerId: null,
    sizeBytes: 0,
    nodeCount: opts.nodeCount,
    url: `/scene/${opts.id}`,
    editorUrl: `/scene/${opts.id}`,
  }
}

function restoreEnv(key: keyof NodeJS.ProcessEnv): void {
  if (OLD_ENV[key] === undefined) delete process.env[key]
  else process.env[key] = OLD_ENV[key]
}
