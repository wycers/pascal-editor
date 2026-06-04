import { createHash } from 'node:crypto'
import type { SceneGraph } from '@pascal-app/core/clone-scene-graph'
import {
  SceneInvalidError,
  SceneNotFoundError,
  type SceneEvent,
  type SceneEventAppendOptions,
  type SceneEventListOptions,
  type SceneListOptions,
  type SceneMeta,
  type SceneMutateOptions,
  type SceneSaveOptions,
  type SceneStore,
  SceneTooLargeError,
  SceneVersionConflictError,
  type SceneWithGraph,
} from '@pascal-app/mcp/storage/types'
import { and, asc, desc, eq, gt, sql } from 'drizzle-orm'
import { z } from 'zod'
import { ensureDemoDatabase, type DemoDatabase } from './db/client'
import { demoSceneEvents, demoSceneRevisions, demoScenes } from './db/schema'

const DEFAULT_MAX_SCENE_BYTES = 10 * 1024 * 1024
const DEFAULT_LIST_LIMIT = 100
const MAX_NAME_LENGTH = 200
const MIN_NAME_LENGTH = 1
const MAX_SLUG_LENGTH = 64
const GENERATED_SLUG_LENGTH = 12
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

type SceneRow = typeof demoScenes.$inferSelect
type SceneEventRow = typeof demoSceneEvents.$inferSelect
type DemoTransaction = Parameters<Parameters<DemoDatabase['transaction']>[0]>[0]
type DemoExecutor = DemoDatabase | DemoTransaction

const StoredGraphSchema = z.object({
  nodes: z.record(z.string(), z.unknown()),
  rootNodeIds: z.array(z.string()),
  collections: z.record(z.string(), z.unknown()).optional(),
})

export class PostgresSceneStore implements SceneStore {
  readonly backend = 'postgres' as const

  private readonly maxSceneBytes: number

  constructor(opts: { env?: NodeJS.ProcessEnv; maxSceneBytes?: number } = {}) {
    this.maxSceneBytes = resolveMaxSceneBytes(opts.env ?? process.env, opts.maxSceneBytes)
  }

  async save(opts: SceneSaveOptions): Promise<SceneMeta> {
    assertValidName(opts.name)
    if (!opts.graph || typeof opts.graph !== 'object') {
      throw new SceneInvalidError('graph is required')
    }

    const graph = parseGraph(opts.graph, 'save input')
    const graphJson = JSON.stringify(graph)
    const sizeBytes = Buffer.byteLength(graphJson, 'utf8')
    if (sizeBytes > this.maxSceneBytes) {
      throw new SceneTooLargeError(
        `Scene is ${sizeBytes} bytes, exceeds cap of ${this.maxSceneBytes} bytes`,
      )
    }

    const db = await this.db()
    return db.transaction(async (tx) => {
      const providedId = opts.id
      const id = providedId ? sanitizeSlug(providedId) : await this.generateUniqueId(tx)
      if (!isValidSlug(id)) {
        throw new SceneInvalidError(`Invalid scene id after sanitization: "${id}"`)
      }

      await tx.execute(sql`SELECT id FROM pascal_demo_scenes WHERE id = ${id} FOR UPDATE`)
      const existing = await getSceneRow(tx, id)
      if (existing && providedId !== undefined && opts.expectedVersion === undefined) {
        throw new SceneInvalidError(
          `Scene with id "${id}" already exists. Pass a different id or provide expectedVersion to overwrite.`,
        )
      }

      if (opts.expectedVersion !== undefined) {
        const currentVersion = existing?.version ?? 0
        if (currentVersion !== opts.expectedVersion) {
          throw new SceneVersionConflictError(
            `Scene "${id}" version mismatch: expected ${opts.expectedVersion}, got ${currentVersion}`,
          )
        }
      }

      const now = new Date()
      const version = (existing?.version ?? 0) + 1
      const createdAt = existing?.createdAt ?? now
      const nodeCount = Object.keys(graph.nodes ?? {}).length
      const projectId = opts.projectId ?? existing?.projectId ?? null
      const ownerId = opts.ownerId ?? existing?.ownerId ?? null
      const thumbnailUrl =
        opts.thumbnailUrl === undefined ? (existing?.thumbnailUrl ?? null) : opts.thumbnailUrl

      const values = {
        id,
        name: opts.name,
        projectId,
        ownerId,
        thumbnailUrl,
        version,
        createdAt,
        updatedAt: now,
        sizeBytes,
        nodeCount,
        graphJson: graph,
      }

      const [saved] = existing
        ? await tx.update(demoScenes).set(values).where(eq(demoScenes.id, id)).returning()
        : await tx.insert(demoScenes).values(values).returning()

      if (!saved) {
        throw new Error(`Failed to save scene "${id}"`)
      }

      await tx.insert(demoSceneRevisions).values({
        sceneId: id,
        version,
        graphJson: graph,
        authorKind: 'demo',
        authorId: ownerId,
        createdAt: now,
      })

      return rowToMeta(saved)
    })
  }

  async load(id: string): Promise<SceneWithGraph | null> {
    const row = await getSceneRow(await this.db(), sanitizeSlug(id))
    if (!row) return null
    return {
      ...rowToMeta(row),
      graph: parseGraph(row.graphJson, row.id),
    }
  }

  async list(opts: SceneListOptions = {}): Promise<SceneMeta[]> {
    const db = await this.db()
    const limit = normalizeListLimit(opts.limit)
    const rows =
      opts.projectId !== undefined && opts.ownerId !== undefined
        ? await db
            .select()
            .from(demoScenes)
            .where(
              and(eq(demoScenes.projectId, opts.projectId), eq(demoScenes.ownerId, opts.ownerId)),
            )
            .orderBy(desc(demoScenes.updatedAt), asc(demoScenes.id))
            .limit(limit)
        : opts.projectId !== undefined
          ? await db
              .select()
              .from(demoScenes)
              .where(eq(demoScenes.projectId, opts.projectId))
              .orderBy(desc(demoScenes.updatedAt), asc(demoScenes.id))
              .limit(limit)
          : opts.ownerId !== undefined
            ? await db
                .select()
                .from(demoScenes)
                .where(eq(demoScenes.ownerId, opts.ownerId))
                .orderBy(desc(demoScenes.updatedAt), asc(demoScenes.id))
                .limit(limit)
            : await db
                .select()
                .from(demoScenes)
                .orderBy(desc(demoScenes.updatedAt), asc(demoScenes.id))
                .limit(limit)

    return rows.map(rowToMeta)
  }

  async delete(id: string, opts: SceneMutateOptions = {}): Promise<boolean> {
    const safeId = sanitizeSlug(id)
    const db = await this.db()

    if (opts.expectedVersion === undefined) {
      const deleted = await db
        .delete(demoScenes)
        .where(eq(demoScenes.id, safeId))
        .returning({ id: demoScenes.id })
      return deleted.length > 0
    }

    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM pascal_demo_scenes WHERE id = ${safeId} FOR UPDATE`)
      const existing = await getSceneRow(tx, safeId)
      if (!existing) return false
      if (existing.version !== opts.expectedVersion) {
        throw new SceneVersionConflictError(
          `Scene "${safeId}" version mismatch: expected ${opts.expectedVersion}, got ${existing.version}`,
        )
      }
      await tx.delete(demoScenes).where(eq(demoScenes.id, safeId))
      return true
    })
  }

  async rename(id: string, newName: string, opts: SceneMutateOptions = {}): Promise<SceneMeta> {
    assertValidName(newName)
    const safeId = sanitizeSlug(id)
    const db = await this.db()

    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM pascal_demo_scenes WHERE id = ${safeId} FOR UPDATE`)
      const existing = await getSceneRow(tx, safeId)
      if (!existing) {
        throw new SceneNotFoundError(`Scene "${safeId}" not found`)
      }
      if (opts.expectedVersion !== undefined && existing.version !== opts.expectedVersion) {
        throw new SceneVersionConflictError(
          `Scene "${safeId}" version mismatch: expected ${opts.expectedVersion}, got ${existing.version}`,
        )
      }

      const now = new Date()
      const version = existing.version + 1
      const [updated] = await tx
        .update(demoScenes)
        .set({ name: newName, version, updatedAt: now })
        .where(eq(demoScenes.id, safeId))
        .returning()

      if (!updated) {
        throw new SceneNotFoundError(`Scene "${safeId}" not found`)
      }

      await tx.insert(demoSceneRevisions).values({
        sceneId: safeId,
        version,
        graphJson: existing.graphJson,
        authorKind: 'demo',
        authorId: existing.ownerId,
        createdAt: now,
      })

      return rowToMeta(updated)
    })
  }

  async appendSceneEvent(opts: SceneEventAppendOptions): Promise<SceneEvent> {
    const safeId = sanitizeSlug(opts.sceneId)
    const graph = parseGraph(opts.graph, `${safeId}@event`)
    const db = await this.db()

    return db.transaction(async (tx) => {
      const existing = await getSceneRow(tx, safeId)
      if (!existing) {
        throw new SceneNotFoundError(`Scene "${safeId}" not found`)
      }

      const [inserted] = await tx
        .insert(demoSceneEvents)
        .values({
          sceneId: safeId,
          version: opts.version,
          kind: opts.kind,
          createdAt: new Date(),
          graphJson: graph,
        })
        .returning()

      if (!inserted) {
        throw new Error(`Failed to append event for scene "${safeId}"`)
      }

      return rowToSceneEvent(inserted)
    })
  }

  async listSceneEvents(sceneId: string, opts: SceneEventListOptions = {}): Promise<SceneEvent[]> {
    const safeId = sanitizeSlug(sceneId)
    const afterEventId = Math.max(0, opts.afterEventId ?? 0)
    const requestedLimit = opts.limit ?? 100
    const limit = Number.isInteger(requestedLimit) && requestedLimit > 0 ? requestedLimit : 100

    const rows = await (await this.db())
      .select()
      .from(demoSceneEvents)
      .where(and(eq(demoSceneEvents.sceneId, safeId), gt(demoSceneEvents.eventId, afterEventId)))
      .orderBy(asc(demoSceneEvents.eventId))
      .limit(limit)

    return rows.map(rowToSceneEvent)
  }

  private db(): Promise<DemoDatabase> {
    return ensureDemoDatabase()
  }

  private async generateUniqueId(db: DemoExecutor): Promise<string> {
    for (let attempt = 0; attempt < 20; attempt++) {
      const id = generateSlug()
      if (!(await getSceneRow(db, id))) return id
    }
    throw new SceneInvalidError('Failed to generate a unique scene id')
  }
}

async function getSceneRow(db: DemoExecutor, id: string): Promise<SceneRow | null> {
  const [row] = await db.select().from(demoScenes).where(eq(demoScenes.id, id)).limit(1)
  return row ?? null
}

function rowToMeta(row: SceneRow): SceneMeta {
  const sceneUrl = `/scene/${row.id}`
  return {
    id: row.id,
    name: row.name,
    projectId: row.projectId,
    ownerId: row.ownerId,
    thumbnailUrl: row.thumbnailUrl,
    version: row.version,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
    sizeBytes: row.sizeBytes,
    nodeCount: row.nodeCount,
    editorUrl: sceneUrl,
    url: sceneUrl,
    published: true,
    graphHash: hashGraph(row.graphJson),
  }
}

function rowToSceneEvent(row: SceneEventRow): SceneEvent {
  return {
    eventId: row.eventId,
    sceneId: row.sceneId,
    version: row.version,
    kind: row.kind,
    createdAt: toIso(row.createdAt),
    graph: parseGraph(row.graphJson, `${row.sceneId}@${row.version}`),
  }
}

function parseGraph(value: unknown, context: string): SceneGraph {
  let parsed = value
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value)
    } catch (err) {
      throw new SceneInvalidError(
        `Failed to parse scene graph for ${context}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  const result = StoredGraphSchema.safeParse(parsed)
  if (!result.success) {
    throw new SceneInvalidError(`Scene graph for ${context} has invalid shape: ${result.error}`)
  }

  const graph = result.data
  for (const [nodeId, node] of Object.entries(graph.nodes)) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) {
      throw new SceneInvalidError(`Scene graph for ${context} has non-object node at "${nodeId}"`)
    }
    const typeField = (node as { type?: unknown }).type
    if (typeof typeField !== 'string' || typeField.length === 0) {
      throw new SceneInvalidError(
        `Scene graph for ${context} has node "${nodeId}" missing a string "type"`,
      )
    }
  }

  return graph as SceneGraph
}

function resolveMaxSceneBytes(
  env: NodeJS.ProcessEnv | undefined,
  explicit: number | undefined,
): number {
  if (explicit !== undefined) {
    if (!Number.isInteger(explicit) || explicit <= 0) {
      throw new SceneInvalidError('maxSceneBytes must be a positive integer')
    }
    return explicit
  }

  const raw = env?.PASCAL_MAX_SCENE_BYTES
  if (raw === undefined || raw === '') return DEFAULT_MAX_SCENE_BYTES
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new SceneInvalidError('PASCAL_MAX_SCENE_BYTES must be a positive integer')
  }
  return parsed
}

function assertValidName(name: string): void {
  if (typeof name !== 'string') {
    throw new SceneInvalidError('Scene name must be a string')
  }
  const trimmed = name.trim()
  if (trimmed.length < MIN_NAME_LENGTH || name.length > MAX_NAME_LENGTH) {
    throw new SceneInvalidError(
      `Scene name must be ${MIN_NAME_LENGTH}-${MAX_NAME_LENGTH} characters (got ${name.length})`,
    )
  }
}

function normalizeListLimit(value: number | undefined): number {
  const requestedLimit = value ?? DEFAULT_LIST_LIMIT
  return Number.isInteger(requestedLimit) && requestedLimit >= 0 ? requestedLimit : 0
}

function hashGraph(graph: SceneGraph): string {
  return createHash('sha256').update(JSON.stringify(graph)).digest('hex')
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function sanitizeSlug(raw: string): string {
  const sanitized = raw
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '')

  if (sanitized.length === 0) {
    throw new SceneInvalidError('Slug cannot be empty after sanitization')
  }

  return sanitized
}

function isValidSlug(value: string): boolean {
  if (typeof value !== 'string') return false
  if (value.length === 0 || value.length > MAX_SLUG_LENGTH) return false
  return SLUG_PATTERN.test(value)
}

function generateSlug(): string {
  const raw = globalThis.crypto?.randomUUID?.().replace(/-/g, '') ?? fallbackRandom()
  const base = raw.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (base.length >= GENERATED_SLUG_LENGTH) {
    return base.slice(0, GENERATED_SLUG_LENGTH)
  }

  let out = base
  while (out.length < GENERATED_SLUG_LENGTH) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  }
  return out.slice(0, GENERATED_SLUG_LENGTH)
}

function fallbackRandom(): string {
  let out = ''
  for (let i = 0; i < GENERATED_SLUG_LENGTH * 2; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  }
  return out
}
