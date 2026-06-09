import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test'

describe('getSceneStore', () => {
  afterAll(() => {
    mock.restore()
  })

  beforeEach(() => {
    mock.module('./postgres-scene-store', () => {
      let callCount = 0
      return {
        PostgresSceneStore: class {
          readonly backend = 'postgres' as const
          readonly __instanceNumber: number

          constructor() {
            callCount++
            this.__instanceNumber = callCount
          }

          save = async () => ({}) as never
          load = async () => null
          list = async () => []
          delete = async () => false
          rename = async () => ({}) as never
        },
      }
    })
  })

  test('returns the same promise on repeated calls', async () => {
    const mod = await import('./scene-store-server')
    mod.__resetSceneStoreForTests()

    const a = mod.getSceneStore()
    const b = mod.getSceneStore()

    expect(a).toBe(b)
  })

  test('resolves to the same store instance across calls', async () => {
    const mod = await import('./scene-store-server')
    mod.__resetSceneStoreForTests()

    const storeA = await mod.getSceneStore()
    const storeB = await mod.getSceneStore()

    expect(storeA).toBe(storeB)
    expect((storeA as unknown as { backend: string }).backend).toBe('postgres')
    expect((storeB as unknown as { backend: string }).backend).toBe('postgres')
  })

  test('reset helper clears the cached singleton', async () => {
    const mod = await import('./scene-store-server')
    mod.__resetSceneStoreForTests()

    const first = await mod.getSceneStore()
    mod.__resetSceneStoreForTests()
    const second = await mod.getSceneStore()

    expect(first).not.toBe(second)
  })

  test('getSceneOperations wraps the cached store', async () => {
    const mod = await import('./scene-store-server')
    mod.__resetSceneStoreForTests()

    const operations = await mod.getSceneOperations()

    expect(operations.hasStore).toBe(true)
    expect(operations.storeBackend).toBe('postgres')
  })
})
