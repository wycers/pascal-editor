import type { SceneGraph } from '@pascal-app/core/clone-scene-graph'
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'

export const demoScenes = pgTable(
  'pascal_demo_scenes',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    projectId: text('project_id'),
    ownerId: text('owner_id'),
    thumbnailUrl: text('thumbnail_url'),
    version: integer('version').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    nodeCount: integer('node_count').notNull(),
    graphJson: jsonb('graph_json').$type<SceneGraph>().notNull(),
  },
  (table) => ({
    ownerUpdatedIdx: index('pascal_demo_scenes_owner_updated_idx').on(
      table.ownerId,
      table.updatedAt,
    ),
    projectUpdatedIdx: index('pascal_demo_scenes_project_updated_idx').on(
      table.projectId,
      table.updatedAt,
    ),
  }),
)

export const demoSceneRevisions = pgTable(
  'pascal_demo_scene_revisions',
  {
    sceneId: text('scene_id')
      .notNull()
      .references(() => demoScenes.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    graphJson: jsonb('graph_json').$type<SceneGraph>().notNull(),
    authorKind: text('author_kind').notNull(),
    authorId: text('author_id'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.sceneId, table.version] }),
  }),
)

export const demoSceneEvents = pgTable(
  'pascal_demo_scene_events',
  {
    eventId: serial('event_id').primaryKey(),
    sceneId: text('scene_id')
      .notNull()
      .references(() => demoScenes.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    kind: text('kind').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
    graphJson: jsonb('graph_json').$type<SceneGraph>().notNull(),
  },
  (table) => ({
    sceneEventIdx: index('pascal_demo_scene_events_scene_event_idx').on(
      table.sceneId,
      table.eventId,
    ),
  }),
)

export const demoLlmConfig = pgTable('pascal_demo_llm_config', {
  id: text('id').primaryKey(),
  enabled: boolean('enabled').notNull(),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  baseUrl: text('base_url'),
  apiKeyEnvVar: text('api_key_env_var').notNull(),
  temperature: real('temperature').notNull(),
  maxToolIterations: integer('max_tool_iterations').notNull(),
  fallbackOnError: boolean('fallback_on_error').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
})
