import type { SceneOperations } from '@pascal-app/mcp/operations'
import { createSceneOperations } from '@pascal-app/mcp/operations'
import type { SceneStore } from '@pascal-app/mcp/storage/types'
import { PostgresSceneStore } from './postgres-scene-store'

/**
 * Per-process singleton. We cache the in-flight promise so concurrent calls
 * during a cold start share one store and one pg pool.
 */
let cachedStore: Promise<SceneStore> | null = null
let cachedOperations: Promise<SceneOperations> | null = null

export function getSceneStore(): Promise<SceneStore> {
  if (!cachedStore) {
    cachedStore = Promise.resolve(new PostgresSceneStore({ env: process.env }))
  }
  return cachedStore
}

export function getSceneOperations(): Promise<SceneOperations> {
  if (!cachedOperations) {
    cachedOperations = getSceneStore().then((store) => createSceneOperations({ store }))
  }
  return cachedOperations
}

/**
 * Test-only helper to reset the cached singleton. Not exported for production
 * callers.
 */
export function __resetSceneStoreForTests(): void {
  cachedStore = null
  cachedOperations = null
}
