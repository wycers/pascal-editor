import {
  BomRulesSchema,
  generateBom,
  type BomSceneGraph,
  type SceneGraph,
} from '@pascal-app/core'
import defaultRules from '@/config/modular-bom-rules.json'

const modularBomRules = BomRulesSchema.parse(defaultRules)
const RELEVANT_BOM_NODE_TYPES = new Set([
  'wall',
  'slab',
  'ceiling',
  'zone',
  'door',
  'window',
  'item',
  'column',
  'roof',
  'roof-segment',
  'stair',
])

export interface DemoSceneMetrics {
  sourceNodeCount: number
  levelCount: number
  roomCount: number
  floorAreaSqMeters: number
  wallLengthMeters: number
  netWallAreaSqMeters: number
  bomSummaryRowCount: number
  bomDetailRowCount: number
  bomExceptionCount: number
  matchedNodeCount: number
  standardizationRate: number
}

export function computeDemoSceneMetrics(sceneGraph: SceneGraph | BomSceneGraph): DemoSceneMetrics {
  const result = generateBom(sceneGraph, modularBomRules)
  const nodes = Object.values(sceneGraph.nodes ?? {})
  const roomCount = nodes.filter(
    (node): node is { type: string } =>
      typeof node === 'object' && node !== null && 'type' in node && node.type === 'zone',
  ).length
  const relevantNodeCount = Math.max(
    1,
    nodes.filter(
      (node): node is { type: string } =>
        typeof node === 'object' &&
        node !== null &&
        'type' in node &&
        typeof node.type === 'string' &&
        RELEVANT_BOM_NODE_TYPES.has(node.type),
    ).length,
  )

  return {
    sourceNodeCount: result.metrics.sourceNodeCount,
    levelCount: result.metrics.levelCount,
    roomCount,
    floorAreaSqMeters: result.metrics.totalFloorAreaSqMeters,
    wallLengthMeters: result.metrics.totalWallLengthMeters,
    netWallAreaSqMeters: result.metrics.totalNetWallAreaSqMeters,
    bomSummaryRowCount: result.metrics.summaryRowCount,
    bomDetailRowCount: result.metrics.detailRowCount,
    bomExceptionCount: result.metrics.exceptionCount,
    matchedNodeCount: result.metrics.matchedNodeCount,
    standardizationRate: Math.round((result.metrics.matchedNodeCount / relevantNodeCount) * 100),
  }
}
