import { describe, expect, test } from 'bun:test'
import { BuildingNode, DoorNode, ItemNode, LevelNode, SlabNode, WallNode } from '../schema'
import type { AnyNode } from '../schema/types'
import {
  type BomRules,
  BomRulesSchema,
  type BomSceneGraph,
  generateBom,
  renderBomCsv,
  renderBomJson,
  renderFloorplanSvg,
} from './index'

describe('generateBom', () => {
  test('takes off walls with openings, slabs with holes, doors, and items', () => {
    const sceneGraph = modularHouseScene()
    const result = generateBom(sceneGraph, houseRules(), {
      generatedAt: new Date('2026-01-02T03:04:05Z'),
    })

    expect(result.metrics.sourceNodeCount).toBe(6)
    expect(result.metrics.matchedNodeCount).toBe(4)
    expect(result.metrics.totalWallLengthMeters).toBe(4)
    expect(result.metrics.totalNetWallAreaSqMeters).toBe(10)
    expect(result.metrics.totalFloorAreaSqMeters).toBe(11)
    expect(result.exceptionRows).toHaveLength(0)

    expect(detailQuantity(result.detailRows, 'WALL-NET')).toBe(10)
    expect(detailQuantity(result.detailRows, 'WALL-PANEL')).toBe(5)
    expect(detailQuantity(result.detailRows, 'SLAB-BOARD')).toBe(11)
    expect(detailQuantity(result.detailRows, 'DOOR-SET')).toBe(1)
    expect(detailQuantity(result.detailRows, 'KITCHEN-SINK')).toBe(1)

    expect(summaryQuantity(result.summaryRows, 'WALL-NET')).toBe(10)
    expect(result.detailRows.find((row) => row.sku === 'WALL-NET')?.dimensions).toContain(
      'Net=10m2',
    )
  })

  test('reports unmatched nodes and invalid polygons as exceptions', () => {
    const building = BuildingNode.parse({ id: 'building_1', children: ['level_1'] })
    const level = LevelNode.parse({
      id: 'level_1',
      parentId: building.id,
      children: ['wall_1', 'slab_bad'],
    })
    const wall = WallNode.parse({
      id: 'wall_1',
      parentId: level.id,
      start: [0, 0],
      end: [3, 0],
      height: 2.8,
      thickness: 0.12,
    })
    const slab = SlabNode.parse({
      id: 'slab_bad',
      parentId: level.id,
      polygon: [
        [0, 0],
        [1, 0],
      ],
    })
    const result = generateBom(sceneOf([building, level, wall, slab]), {
      version: 1,
      rules: [
        {
          id: 'slab-area',
          sku: 'SLAB',
          name: 'Slab',
          category: 'Floor',
          unit: 'm2',
          match: { nodeTypes: ['slab'] },
          quantityMethod: 'polygon_area',
        },
      ],
    })

    expect(result.exceptionRows.map((row) => row.reason)).toContain('unmatched_node')
    expect(result.exceptionRows.map((row) => row.reason)).toContain('invalid_polygon')
    expect(result.exceptionRows.map((row) => row.reason)).toContain('quantity_unavailable')
  })

  test('uses rule matching precedence from bomSku to asset id to type to category', () => {
    const item = rulePrecedenceItem('fixture_sink', { bomSku: 'SKU-META' })

    expect(
      generateBom(sceneOf([item]), {
        version: 1,
        rules: [
          itemRule('asset', 'SKU-ASSET', { assetIds: ['fixture_sink'] }),
          itemRule('metadata', 'SKU-META', {}),
        ],
      }).summaryRows.map((row) => row.sku),
    ).toEqual(['SKU-META'])

    expect(
      generateBom(sceneOf([rulePrecedenceItem('fixture_sink')]), {
        version: 1,
        rules: [
          itemRule('category', 'SKU-CATEGORY', { assetCategories: ['kitchen'] }),
          itemRule('type', 'SKU-TYPE', { nodeTypes: ['item'] }),
          itemRule('asset', 'SKU-ASSET', { assetIds: ['fixture_sink'] }),
        ],
      }).summaryRows.map((row) => row.sku),
    ).toEqual(['SKU-ASSET'])

    expect(
      generateBom(sceneOf([rulePrecedenceItem('other_asset')]), {
        version: 1,
        rules: [
          itemRule('category', 'SKU-CATEGORY', { assetCategories: ['kitchen'] }),
          itemRule('type', 'SKU-TYPE', { nodeTypes: ['item'] }),
        ],
      }).summaryRows.map((row) => row.sku),
    ).toEqual(['SKU-TYPE'])

    expect(
      generateBom(sceneOf([rulePrecedenceItem('other_asset')]), {
        version: 1,
        rules: [itemRule('category', 'SKU-CATEGORY', { assetCategories: ['kitchen'] })],
      }).summaryRows.map((row) => row.sku),
    ).toEqual(['SKU-CATEGORY'])
  })
})

describe('BOM renderers', () => {
  test('renders CSV and JSON with matching row counts', () => {
    const result = generateBom(modularHouseScene(), houseRules())
    const summaryCsv = renderBomCsv(result.summaryRows as unknown as Array<Record<string, unknown>>)
    const detailCsv = renderBomCsv(result.detailRows as unknown as Array<Record<string, unknown>>)
    const json = JSON.parse(renderBomJson(result))

    expect(summaryCsv.trim().split('\r\n')).toHaveLength(result.summaryRows.length + 1)
    expect(detailCsv.trim().split('\r\n')).toHaveLength(result.detailRows.length + 1)
    expect(json.summaryRows).toHaveLength(result.summaryRows.length)
    expect(json.detailRows).toHaveLength(result.detailRows.length)
  })

  test('renders a floorplan SVG for a simple rectangular level', () => {
    const floorplans = renderFloorplanSvg(modularHouseScene())

    expect(floorplans).toHaveLength(1)
    expect(floorplans[0]?.filename).toBe('floorplan-level-1.svg')
    expect(floorplans[0]?.svg).toContain('<polygon')
    expect(floorplans[0]?.svg).toContain('<line')
  })
})

function modularHouseScene(): BomSceneGraph {
  const building = BuildingNode.parse({ id: 'building_1', name: 'Module', children: ['level_1'] })
  const level = LevelNode.parse({
    id: 'level_1',
    name: 'Ground',
    parentId: building.id,
    level: 0,
    children: ['wall_1', 'slab_1', 'item_1'],
  })
  const door = DoorNode.parse({
    id: 'door_1',
    parentId: 'wall_1',
    wallId: 'wall_1',
    width: 1,
    height: 2,
    position: [2, 1, 0],
  })
  const wall = WallNode.parse({
    id: 'wall_1',
    parentId: level.id,
    children: [door.id],
    start: [0, 0],
    end: [4, 0],
    height: 3,
    thickness: 0.12,
  })
  const slab = SlabNode.parse({
    id: 'slab_1',
    parentId: level.id,
    polygon: [
      [0, 0],
      [4, 0],
      [4, 3],
      [0, 3],
    ],
    holes: [
      [
        [1, 1],
        [2, 1],
        [2, 2],
        [1, 2],
      ],
    ],
  })
  const item = ItemNode.parse({
    id: 'item_1',
    parentId: level.id,
    asset: kitchenAsset('fixture_sink'),
  })

  return sceneOf([building, level, wall, door, slab, item])
}

function houseRules(): BomRules {
  return BomRulesSchema.parse({
    version: 1,
    rules: [
      {
        id: 'wall-net',
        sku: 'WALL-NET',
        name: 'Wall net area',
        category: 'Wall',
        unit: 'm2',
        match: { nodeTypes: ['wall'] },
        quantityMethod: 'wall_net_area',
        roundTo: 0.01,
      },
      {
        id: 'wall-panel',
        sku: 'WALL-PANEL',
        name: 'Wall panel 1220x2440',
        category: 'Wall',
        unit: 'pcs',
        match: { nodeTypes: ['wall'] },
        quantityMethod: 'wall_panel_count',
        wastePercent: 5,
        pieceSize: { width: 1.22, height: 2.44 },
        roundTo: 1,
      },
      {
        id: 'slab-board',
        sku: 'SLAB-BOARD',
        name: 'Floor board',
        category: 'Floor',
        unit: 'm2',
        match: { nodeTypes: ['slab'] },
        quantityMethod: 'polygon_area',
      },
      {
        id: 'door-set',
        sku: 'DOOR-SET',
        name: 'Door set',
        category: 'Openings',
        unit: 'set',
        match: { nodeTypes: ['door'] },
        quantityMethod: 'count',
      },
      {
        id: 'sink',
        sku: 'KITCHEN-SINK',
        name: 'Kitchen sink',
        category: 'Items',
        unit: 'set',
        match: { assetIds: ['fixture_sink'] },
        quantityMethod: 'item_count',
      },
    ],
  })
}

function itemRule(id: string, sku: string, match: BomRules['rules'][number]['match']) {
  return {
    id,
    sku,
    name: sku,
    category: 'Items',
    unit: 'set',
    match,
    quantityMethod: 'item_count' as const,
  }
}

function kitchenAsset(id: string) {
  return {
    id,
    category: 'kitchen',
    name: id,
    thumbnail: '/assets/thumb.png',
    src: '/assets/model.glb',
    dimensions: [1, 0.8, 0.6] as [number, number, number],
  }
}

function rulePrecedenceItem(id: string, metadata: Record<string, unknown> = {}) {
  return ItemNode.parse({
    id: 'item_1',
    metadata,
    asset: kitchenAsset(id),
  })
}

function sceneOf(nodes: AnyNode[]): BomSceneGraph {
  return {
    nodes: Object.fromEntries(nodes.map((node) => [node.id, node])),
    rootNodeIds: nodes.filter((node) => node.parentId === null).map((node) => node.id),
  }
}

function detailQuantity(rows: ReturnType<typeof generateBom>['detailRows'], sku: string) {
  return rows.find((row) => row.sku === sku)?.quantity
}

function summaryQuantity(rows: ReturnType<typeof generateBom>['summaryRows'], sku: string) {
  return rows.find((row) => row.sku === sku)?.quantity
}
