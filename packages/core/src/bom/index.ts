import { z } from 'zod'
import { type AnyNode, type AnyNodeId, AnyNode as AnyNodeSchema } from '../schema/types'
import { getWallCurveLength } from '../systems/wall/wall-curve'
import { DEFAULT_WALL_HEIGHT, getWallThickness } from '../systems/wall/wall-footprint'

export const BomQuantityMethod = z.enum([
  'count',
  'wall_length',
  'wall_gross_area',
  'wall_net_area',
  'wall_volume',
  'wall_panel_count',
  'opening_area',
  'polygon_area',
  'item_count',
  'item_footprint_area',
  'column_count',
  'column_volume',
  'roof_footprint_area',
  'roof_deck_area',
  'stair_count',
  'stair_step_count',
])

export type BomQuantityMethod = z.infer<typeof BomQuantityMethod>

export const BomRuleMatchSchema = z
  .object({
    bomSkus: z.array(z.string().min(1)).optional(),
    nodeTypes: z.array(z.string().min(1)).optional(),
    assetIds: z.array(z.string().min(1)).optional(),
    assetCategories: z.array(z.string().min(1)).optional(),
  })
  .default({})

export const BomPieceSizeSchema = z.object({
  length: z.number().positive().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  area: z.number().positive().optional(),
})

export const BomRuleSchema = z.object({
  id: z.string().min(1),
  sku: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1).default('General'),
  unit: z.string().min(1),
  spec: z.string().optional(),
  match: BomRuleMatchSchema,
  quantityMethod: BomQuantityMethod.default('count'),
  multiplier: z.number().default(1),
  wastePercent: z.number().min(0).default(0),
  roundTo: z.number().positive().optional(),
  pieceSize: BomPieceSizeSchema.optional(),
})

export const BomRulesSchema = z.object({
  version: z.number().int().positive().default(1),
  rules: z.array(BomRuleSchema),
})

export type BomRule = z.infer<typeof BomRuleSchema>
export type BomRules = z.infer<typeof BomRulesSchema>

export type BomSceneGraph = {
  nodes: Record<string, unknown>
  rootNodeIds: string[]
  collections?: unknown
}

export type BomSummaryRow = {
  sku: string
  category: string
  name: string
  spec: string
  unit: string
  quantity: number
  sourceCount: number
}

export type BomDetailRow = {
  sourceNodeId: string
  sourceNodeType: string
  levelId: string
  levelName: string
  sku: string
  category: string
  name: string
  spec: string
  unit: string
  baseQuantity: number
  multiplier: number
  wastePercent: number
  quantity: number
  formula: string
  ruleId: string
  dimensions: string
}

export type BomExceptionRow = {
  severity: 'warning' | 'error'
  nodeId: string
  nodeType: string
  reason: string
  detail: string
}

export type BomMetrics = {
  generatedAt: string
  sourceNodeCount: number
  matchedNodeCount: number
  detailRowCount: number
  summaryRowCount: number
  exceptionCount: number
  levelCount: number
  totalWallLengthMeters: number
  totalNetWallAreaSqMeters: number
  totalFloorAreaSqMeters: number
}

export type BomResult = {
  summaryRows: BomSummaryRow[]
  detailRows: BomDetailRow[]
  exceptionRows: BomExceptionRow[]
  metrics: BomMetrics
}

export type FloorplanSvg = {
  filename: string
  levelId: string
  levelName: string
  svg: string
}

type NormalizedScene = {
  nodes: Record<string, AnyNode>
  invalidNodes: BomExceptionRow[]
}

const RELEVANT_UNMATCHED_NODE_TYPES = new Set([
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

export function generateBom(
  sceneGraph: BomSceneGraph,
  inputRules: BomRules | z.input<typeof BomRulesSchema>,
  options: { generatedAt?: Date } = {},
): BomResult {
  const rules = BomRulesSchema.parse(inputRules)
  const { nodes, invalidNodes } = normalizeScene(sceneGraph)
  const exceptionRows: BomExceptionRow[] = [...invalidNodes]
  const detailRows: BomDetailRow[] = []
  const matchedNodeIds = new Set<string>()

  addRelationshipExceptions(nodes, exceptionRows)
  addGeometryExceptions(nodes, exceptionRows)

  for (const node of Object.values(nodes)) {
    if (!RELEVANT_UNMATCHED_NODE_TYPES.has(node.type)) continue

    const matchedRules = findBestRulesForNode(node, rules.rules)
    if (matchedRules.length === 0) {
      exceptionRows.push({
        severity: 'warning',
        nodeId: node.id,
        nodeType: node.type,
        reason: 'unmatched_node',
        detail: `No BOM rule matched ${node.type} ${node.id}`,
      })
      continue
    }

    matchedNodeIds.add(node.id)

    for (const rule of matchedRules) {
      const quantity = computeQuantity(node, rule, nodes)
      if (!quantity) {
        exceptionRows.push({
          severity: 'warning',
          nodeId: node.id,
          nodeType: node.type,
          reason: 'quantity_unavailable',
          detail: `Rule ${rule.id} cannot compute ${rule.quantityMethod} for ${node.type}`,
        })
        continue
      }

      const level = resolveLevelInfo(node, nodes)
      const finalQuantity = applyQuantityAdjustments(quantity.value, rule)
      detailRows.push({
        sourceNodeId: node.id,
        sourceNodeType: node.type,
        levelId: level.id,
        levelName: level.name,
        sku: rule.sku,
        category: rule.category,
        name: rule.name,
        spec: rule.spec ?? '',
        unit: rule.unit,
        baseQuantity: round(quantity.value, 0.0001),
        multiplier: rule.multiplier,
        wastePercent: rule.wastePercent,
        quantity: finalQuantity,
        formula: quantity.formula,
        ruleId: rule.id,
        dimensions: describeNodeDimensions(node, nodes),
      })
    }
  }

  const summaryRows = summarizeDetails(detailRows)
  const levels = Object.values(nodes).filter((node) => node.type === 'level')

  return {
    summaryRows,
    detailRows,
    exceptionRows,
    metrics: {
      generatedAt: (options.generatedAt ?? new Date()).toISOString(),
      sourceNodeCount: Object.keys(nodes).length,
      matchedNodeCount: matchedNodeIds.size,
      detailRowCount: detailRows.length,
      summaryRowCount: summaryRows.length,
      exceptionCount: exceptionRows.length,
      levelCount: levels.length,
      totalWallLengthMeters: round(totalWallLength(nodes), 0.01),
      totalNetWallAreaSqMeters: round(totalNetWallArea(nodes), 0.01),
      totalFloorAreaSqMeters: round(totalPolygonArea(nodes, 'slab'), 0.01),
    },
  }
}

export function renderBomCsv(rows: Array<Record<string, unknown>>, headers?: string[]): string {
  const columnHeaders = headers ?? Object.keys(rows[0] ?? {})
  if (columnHeaders.length === 0) return ''
  const lines = [
    columnHeaders.map(escapeCsvCell).join(','),
    ...rows.map((row) => columnHeaders.map((header) => escapeCsvCell(row[header])).join(',')),
  ]
  return `${lines.join('\r\n')}\r\n`
}

export function renderBomJson(result: BomResult): string {
  return JSON.stringify(result, null, 2)
}

export function renderFloorplanSvg(sceneGraph: BomSceneGraph): FloorplanSvg[] {
  const { nodes } = normalizeScene(sceneGraph)
  const levels = Object.values(nodes)
    .filter((node) => node.type === 'level')
    .sort((a, b) => (a.type === 'level' ? a.level : 0) - (b.type === 'level' ? b.level : 0))

  return levels.map((level, index) => renderLevelFloorplanSvg(level, nodes, index))
}

function normalizeScene(sceneGraph: BomSceneGraph): NormalizedScene {
  const nodes: Record<string, AnyNode> = {}
  const invalidNodes: BomExceptionRow[] = []

  for (const [nodeId, rawNode] of Object.entries(sceneGraph.nodes ?? {})) {
    const parsed = AnyNodeSchema.safeParse(rawNode)
    if (parsed.success) {
      nodes[nodeId] = parsed.data
      continue
    }

    invalidNodes.push({
      severity: 'error',
      nodeId,
      nodeType:
        typeof rawNode === 'object' &&
        rawNode !== null &&
        'type' in rawNode &&
        typeof (rawNode as { type?: unknown }).type === 'string'
          ? (rawNode as { type: string }).type
          : 'unknown',
      reason: 'invalid_node',
      detail: parsed.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; '),
    })
  }

  return { nodes, invalidNodes }
}

function findBestRulesForNode(node: AnyNode, rules: BomRule[]): BomRule[] {
  const scored = rules
    .map((rule) => ({ rule, score: matchScore(node, rule) }))
    .filter((entry) => entry.score > 0)

  if (scored.length === 0) return []
  const bestScore = Math.max(...scored.map((entry) => entry.score))
  return scored.filter((entry) => entry.score === bestScore).map((entry) => entry.rule)
}

function matchScore(node: AnyNode, rule: BomRule): number {
  const metadataSku = metadataBomSku(node)
  if (metadataSku) {
    if (rule.sku === metadataSku || rule.match.bomSkus?.includes(metadataSku)) return 100
    return 0
  }

  if (node.type === 'item' && rule.match.assetIds?.includes(node.asset.id)) return 80
  if (rule.match.nodeTypes?.includes(node.type)) return 60
  if (node.type === 'item' && rule.match.assetCategories?.includes(node.asset.category)) return 40
  return 0
}

function metadataBomSku(node: AnyNode): string | undefined {
  const metadata = node.metadata
  if (!metadata || typeof metadata !== 'object') return undefined
  const value = (metadata as Record<string, unknown>).bomSku
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function computeQuantity(
  node: AnyNode,
  rule: BomRule,
  nodes: Record<string, AnyNode>,
): { value: number; formula: string } | null {
  switch (rule.quantityMethod) {
    case 'count':
      return { value: 1, formula: 'count' }
    case 'wall_length':
      if (node.type !== 'wall') return null
      if (wallLength(node) <= 0) return null
      return { value: wallLength(node), formula: 'wall length' }
    case 'wall_gross_area':
      if (node.type !== 'wall') return null
      if (wallLength(node) <= 0) return null
      return { value: wallGrossArea(node), formula: 'wall length * wall height' }
    case 'wall_net_area':
      if (node.type !== 'wall') return null
      if (wallLength(node) <= 0) return null
      return { value: wallNetArea(node, nodes), formula: 'gross wall area - openings' }
    case 'wall_volume':
      if (node.type !== 'wall') return null
      if (wallLength(node) <= 0) return null
      return {
        value: wallNetArea(node, nodes) * getWallThickness(node),
        formula: 'net wall area * wall thickness',
      }
    case 'wall_panel_count':
      if (node.type !== 'wall') return null
      return wallPanelCount(node, rule, nodes)
    case 'opening_area':
      if (!(node.type === 'door' || node.type === 'window')) return null
      return { value: node.width * node.height, formula: 'opening width * opening height' }
    case 'polygon_area':
      if (!(node.type === 'slab' || node.type === 'ceiling' || node.type === 'zone')) return null
      if (!isValidPolygon(node.polygon)) return null
      return { value: polygonWithHolesArea(node), formula: 'polygon area - hole areas' }
    case 'item_count':
      if (node.type !== 'item') return null
      return { value: 1, formula: 'item count' }
    case 'item_footprint_area':
      if (node.type !== 'item') return null
      return {
        value: node.asset.dimensions[0] * node.scale[0] * node.asset.dimensions[2] * node.scale[2],
        formula: 'scaled item width * scaled item depth',
      }
    case 'column_count':
      if (node.type !== 'column') return null
      return { value: 1, formula: 'column count' }
    case 'column_volume':
      if (node.type !== 'column') return null
      return { value: columnVolume(node), formula: 'column cross-section area * height' }
    case 'roof_footprint_area':
      if (!(node.type === 'roof' || node.type === 'roof-segment')) return null
      return { value: roofFootprintArea(node, nodes), formula: 'roof footprint width * depth' }
    case 'roof_deck_area':
      if (!(node.type === 'roof' || node.type === 'roof-segment')) return null
      return { value: roofDeckArea(node, nodes), formula: 'approximate roof deck surface area' }
    case 'stair_count':
      if (node.type !== 'stair') return null
      return { value: 1, formula: 'stair count' }
    case 'stair_step_count':
      if (node.type !== 'stair') return null
      return { value: node.stepCount, formula: 'stair step count' }
  }
}

function applyQuantityAdjustments(value: number, rule: BomRule): number {
  const withMultiplier = value * rule.multiplier
  const withWaste = withMultiplier * (1 + rule.wastePercent / 100)
  return roundUp(withWaste, rule.roundTo ?? 0.0001)
}

function wallPanelCount(
  wall: Extract<AnyNode, { type: 'wall' }>,
  rule: BomRule,
  nodes: Record<string, AnyNode>,
): { value: number; formula: string } | null {
  const area = wallNetArea(wall, nodes)
  const panelArea =
    rule.pieceSize?.area ??
    (rule.pieceSize?.width && rule.pieceSize?.height
      ? rule.pieceSize.width * rule.pieceSize.height
      : null)

  if (!panelArea || panelArea <= 0) return null
  return {
    value: Math.ceil(area / panelArea),
    formula: `ceil(net wall area / ${panelArea} m2 panel)`,
  }
}

function summarizeDetails(detailRows: BomDetailRow[]): BomSummaryRow[] {
  const grouped = new Map<string, BomSummaryRow>()

  for (const row of detailRows) {
    const key = JSON.stringify([row.sku, row.category, row.name, row.spec, row.unit])
    const existing = grouped.get(key)
    if (existing) {
      existing.quantity = round(existing.quantity + row.quantity, 0.0001)
      existing.sourceCount += 1
      continue
    }
    grouped.set(key, {
      sku: row.sku,
      category: row.category,
      name: row.name,
      spec: row.spec,
      unit: row.unit,
      quantity: row.quantity,
      sourceCount: 1,
    })
  }

  return Array.from(grouped.values()).sort((a, b) =>
    `${a.category}:${a.sku}`.localeCompare(`${b.category}:${b.sku}`),
  )
}

function addRelationshipExceptions(nodes: Record<string, AnyNode>, rows: BomExceptionRow[]) {
  for (const node of Object.values(nodes)) {
    if (!(node.type === 'door' || node.type === 'window')) continue

    const parent = node.parentId ? nodes[node.parentId] : null
    if (!parent || parent.type !== 'wall') {
      rows.push({
        severity: 'warning',
        nodeId: node.id,
        nodeType: node.type,
        reason: 'opening_not_parented_to_wall',
        detail: `${node.type} ${node.id} should be parented to a wall for wall net-area takeoff`,
      })
      continue
    }

    if (node.wallId && node.wallId !== parent.id) {
      rows.push({
        severity: 'warning',
        nodeId: node.id,
        nodeType: node.type,
        reason: 'opening_wall_mismatch',
        detail: `${node.type} wallId ${node.wallId} does not match parent wall ${parent.id}`,
      })
    }
  }

  for (const node of Object.values(nodes)) {
    if (node.type !== 'wall') continue
    if (node.height === undefined) {
      rows.push({
        severity: 'warning',
        nodeId: node.id,
        nodeType: node.type,
        reason: 'missing_wall_height',
        detail: `Using default wall height ${DEFAULT_WALL_HEIGHT}m`,
      })
    }
    if (node.thickness === undefined) {
      rows.push({
        severity: 'warning',
        nodeId: node.id,
        nodeType: node.type,
        reason: 'missing_wall_thickness',
        detail: `Using default wall thickness ${getWallThickness(node)}m`,
      })
    }
  }
}

function addGeometryExceptions(nodes: Record<string, AnyNode>, rows: BomExceptionRow[]) {
  for (const node of Object.values(nodes)) {
    if (node.type === 'wall' && wallLength(node) <= 0) {
      rows.push({
        severity: 'error',
        nodeId: node.id,
        nodeType: node.type,
        reason: 'invalid_wall_geometry',
        detail: 'Wall length must be greater than 0',
      })
    }

    if (node.type === 'slab' || node.type === 'ceiling' || node.type === 'zone') {
      if (!isValidPolygon(node.polygon)) {
        rows.push({
          severity: 'error',
          nodeId: node.id,
          nodeType: node.type,
          reason: 'invalid_polygon',
          detail: 'Polygon must contain at least 3 points and have non-zero area',
        })
      }

      if (node.type !== 'zone') {
        for (const [index, hole] of node.holes.entries()) {
          if (!isValidPolygon(hole)) {
            rows.push({
              severity: 'warning',
              nodeId: node.id,
              nodeType: node.type,
              reason: 'invalid_polygon_hole',
              detail: `Hole ${index + 1} must contain at least 3 points and have non-zero area`,
            })
          }
        }
      }
    }
  }
}

function resolveLevelInfo(
  node: AnyNode,
  nodes: Record<string, AnyNode>,
): { id: string; name: string } {
  let current: AnyNode | undefined = node
  const seen = new Set<string>()
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    if (current.type === 'level') {
      return { id: current.id, name: current.name ?? `Level ${current.level}` }
    }
    current = current.parentId ? nodes[current.parentId] : undefined
  }
  return { id: '', name: '' }
}

function wallLength(wall: Extract<AnyNode, { type: 'wall' }>): number {
  return getWallCurveLength(wall)
}

function wallGrossArea(wall: Extract<AnyNode, { type: 'wall' }>): number {
  return wallLength(wall) * (wall.height ?? DEFAULT_WALL_HEIGHT)
}

function wallNetArea(
  wall: Extract<AnyNode, { type: 'wall' }>,
  nodes: Record<string, AnyNode>,
): number {
  return Math.max(0, wallGrossArea(wall) - wallOpeningArea(wall, nodes))
}

function wallOpeningArea(
  wall: Extract<AnyNode, { type: 'wall' }>,
  nodes: Record<string, AnyNode>,
): number {
  let area = 0
  const seen = new Set<string>()
  for (const childId of wall.children ?? []) {
    const child = nodes[childId]
    if (child && (child.type === 'door' || child.type === 'window')) {
      seen.add(child.id)
      area += child.width * child.height
    }
  }

  for (const node of Object.values(nodes)) {
    if (seen.has(node.id)) continue
    if ((node.type === 'door' || node.type === 'window') && node.parentId === wall.id) {
      area += node.width * node.height
    }
  }
  return area
}

function polygonWithHolesArea(
  node: Extract<AnyNode, { type: 'slab' | 'ceiling' | 'zone' }>,
): number {
  const baseArea = polygonArea(node.polygon)
  if (node.type === 'zone') return baseArea
  return Math.max(
    0,
    baseArea - (node.holes ?? []).reduce((sum, hole) => sum + polygonArea(hole), 0),
  )
}

function isValidPolygon(points: Array<[number, number]>): boolean {
  return points.length >= 3 && polygonArea(points) > 0
}

function polygonArea(points: Array<[number, number]>): number {
  if (points.length < 3) return 0
  let sum = 0
  for (let index = 0; index < points.length; index += 1) {
    const [x1, z1] = points[index]!
    const [x2, z2] = points[(index + 1) % points.length]!
    sum += x1 * z2 - x2 * z1
  }
  return Math.abs(sum) / 2
}

function columnVolume(column: Extract<AnyNode, { type: 'column' }>): number {
  const shaftHeight = Math.max(0, column.height)
  if (column.crossSection === 'round') {
    return Math.PI * column.radius * column.radius * shaftHeight
  }
  if (column.crossSection === 'square') {
    return column.width * column.width * shaftHeight
  }
  return column.width * column.depth * shaftHeight
}

function roofFootprintArea(
  node: Extract<AnyNode, { type: 'roof' | 'roof-segment' }>,
  nodes: Record<string, AnyNode>,
): number {
  if (node.type === 'roof-segment') return node.width * node.depth
  return node.children.reduce((sum, childId) => {
    const child = nodes[childId]
    return child?.type === 'roof-segment' ? sum + child.width * child.depth : sum
  }, 0)
}

function roofDeckArea(
  node: Extract<AnyNode, { type: 'roof' | 'roof-segment' }>,
  nodes: Record<string, AnyNode>,
): number {
  if (node.type === 'roof') {
    return node.children.reduce((sum, childId) => {
      const child = nodes[childId]
      return child?.type === 'roof-segment' ? sum + roofDeckArea(child, nodes) : sum
    }, 0)
  }

  if (node.roofType === 'flat') return node.width * node.depth
  if (node.roofType === 'shed') {
    return node.width * Math.sqrt(node.depth ** 2 + node.roofHeight ** 2)
  }
  if (node.roofType === 'gable') {
    return 2 * node.width * Math.sqrt((node.depth / 2) ** 2 + node.roofHeight ** 2)
  }
  return node.width * node.depth * 1.15
}

function totalWallLength(nodes: Record<string, AnyNode>): number {
  return Object.values(nodes).reduce(
    (sum, node) => (node.type === 'wall' ? sum + wallLength(node) : sum),
    0,
  )
}

function totalNetWallArea(nodes: Record<string, AnyNode>): number {
  return Object.values(nodes).reduce(
    (sum, node) => (node.type === 'wall' ? sum + wallNetArea(node, nodes) : sum),
    0,
  )
}

function totalPolygonArea(
  nodes: Record<string, AnyNode>,
  type: 'slab' | 'ceiling' | 'zone',
): number {
  return Object.values(nodes).reduce(
    (sum, node) => (node.type === type ? sum + polygonWithHolesArea(node) : sum),
    0,
  )
}

function describeNodeDimensions(node: AnyNode, nodes: Record<string, AnyNode>): string {
  switch (node.type) {
    case 'wall':
      return `L=${round(wallLength(node), 0.001)}m H=${node.height ?? DEFAULT_WALL_HEIGHT}m T=${getWallThickness(node)}m Net=${round(wallNetArea(node, nodes), 0.001)}m2`
    case 'door':
    case 'window':
      return `W=${node.width}m H=${node.height}m`
    case 'slab':
    case 'ceiling':
    case 'zone':
      return `Area=${round(polygonWithHolesArea(node), 0.001)}m2`
    case 'item':
      return `W=${round(node.asset.dimensions[0] * node.scale[0], 0.001)}m H=${round(node.asset.dimensions[1] * node.scale[1], 0.001)}m D=${round(node.asset.dimensions[2] * node.scale[2], 0.001)}m`
    case 'column':
      return `H=${node.height}m W=${node.width}m D=${node.depth}m R=${node.radius}m`
    case 'roof-segment':
      return `W=${node.width}m D=${node.depth}m RoofH=${node.roofHeight}m`
    case 'roof':
      return `Segments=${node.children.length}`
    case 'stair':
      return `W=${node.width}m Steps=${node.stepCount}`
    default:
      return ''
  }
}

function renderLevelFloorplanSvg(
  level: AnyNode,
  nodes: Record<string, AnyNode>,
  index: number,
): FloorplanSvg {
  const levelId = level.id as AnyNodeId
  const levelName = level.type === 'level' ? (level.name ?? `Level ${level.level}`) : level.id
  const levelNodes = Object.values(nodes).filter(
    (node) => resolveLevelInfo(node, nodes).id === levelId,
  )
  const bounds = floorplanBounds(levelNodes) ?? { minX: -1, minZ: -1, maxX: 1, maxZ: 1 }
  const pad = Math.max(1, Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) * 0.05)
  const viewBox = [
    round(bounds.minX - pad, 0.001),
    round(bounds.minZ - pad, 0.001),
    round(bounds.maxX - bounds.minX + pad * 2, 0.001),
    round(bounds.maxZ - bounds.minZ + pad * 2, 0.001),
  ] as const

  const elements: string[] = []
  for (const node of levelNodes) {
    if (node.type === 'slab') {
      elements.push(
        `<polygon points="${pointsAttr(node.polygon)}" fill="#f8fafc" stroke="#94a3b8" stroke-width="0.03"/>`,
      )
    }
  }
  for (const node of levelNodes) {
    if (node.type === 'zone') {
      elements.push(
        `<polygon points="${pointsAttr(node.polygon)}" fill="${escapeXml(node.color)}33" stroke="${escapeXml(node.color)}" stroke-width="0.025"/>`,
      )
      const c = centroid(node.polygon)
      elements.push(
        `<text x="${c[0]}" y="${c[1]}" font-size="0.25" text-anchor="middle" fill="#0f172a">${escapeXml(node.name)}</text>`,
      )
    }
  }
  for (const node of levelNodes) {
    if (node.type === 'wall') {
      elements.push(
        `<line x1="${node.start[0]}" y1="${node.start[1]}" x2="${node.end[0]}" y2="${node.end[1]}" stroke="#111827" stroke-linecap="round" stroke-width="${Math.max(0.04, getWallThickness(node))}"/>`,
      )
    }
  }
  for (const node of levelNodes) {
    if (node.type === 'door' || node.type === 'window') {
      const point = openingPlanPoint(node, nodes)
      if (!point) continue
      const color = node.type === 'door' ? '#dc2626' : '#2563eb'
      elements.push(`<circle cx="${point[0]}" cy="${point[1]}" r="0.11" fill="${color}"/>`)
    }
  }

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.join(' ')}" width="1600" height="1000">`,
    '<rect x="-100000" y="-100000" width="200000" height="200000" fill="white"/>',
    `<text x="${viewBox[0]}" y="${viewBox[1] + 0.35}" font-size="0.3" fill="#111827">${escapeXml(levelName)}</text>`,
    ...elements,
    '</svg>',
  ].join('\n')

  return {
    filename: `floorplan-level-${index + 1}.svg`,
    levelId,
    levelName,
    svg,
  }
}

function floorplanBounds(nodes: AnyNode[]) {
  const points: Array<[number, number]> = []
  for (const node of nodes) {
    if (node.type === 'wall') points.push(node.start, node.end)
    if (node.type === 'slab' || node.type === 'ceiling' || node.type === 'zone') {
      points.push(...node.polygon)
    }
    if (node.type === 'item' || node.type === 'column' || node.type === 'stair') {
      points.push([node.position[0], node.position[2]])
    }
  }
  if (points.length === 0) return null
  const xs = points.map((point) => point[0])
  const zs = points.map((point) => point[1])
  return {
    minX: Math.min(...xs),
    minZ: Math.min(...zs),
    maxX: Math.max(...xs),
    maxZ: Math.max(...zs),
  }
}

function openingPlanPoint(
  opening: Extract<AnyNode, { type: 'door' | 'window' }>,
  nodes: Record<string, AnyNode>,
): [number, number] | null {
  const wall = opening.parentId
    ? nodes[opening.parentId]
    : opening.wallId
      ? nodes[opening.wallId]
      : null
  if (!wall || wall.type !== 'wall') return null
  const length = wallLength(wall)
  const t = length > 0 ? opening.position[0] / length : 0.5
  const clamped = Math.max(0, Math.min(1, t))
  return [
    wall.start[0] + (wall.end[0] - wall.start[0]) * clamped,
    wall.start[1] + (wall.end[1] - wall.start[1]) * clamped,
  ]
}

function pointsAttr(points: Array<[number, number]>): string {
  return points.map(([x, z]) => `${x},${z}`).join(' ')
}

function centroid(points: Array<[number, number]>): [number, number] {
  if (points.length === 0) return [0, 0]
  const total = points.reduce<[number, number]>(
    (sum, point) => [sum[0] + point[0], sum[1] + point[1]],
    [0, 0],
  )
  return [total[0] / points.length, total[1] / points.length]
}

function round(value: number, step: number): number {
  if (!(Number.isFinite(value) && Number.isFinite(step)) || step <= 0) return value
  return Math.round(value / step) * step
}

function roundUp(value: number, step: number): number {
  if (!(Number.isFinite(value) && Number.isFinite(step)) || step <= 0) return value
  return Number((Math.ceil((value - 1e-12) / step) * step).toFixed(6))
}

function escapeCsvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value)
  if (!/[",\r\n]/.test(text)) return text
  return `"${text.replaceAll('"', '""')}"`
}

function escapeXml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}
