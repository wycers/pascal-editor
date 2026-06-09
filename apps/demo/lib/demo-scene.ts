import {
  type AnyNode,
  type AnyNodeId,
  BuildingNode,
  CeilingNode,
  ColumnNode,
  DoorNode,
  LevelNode,
  RoofNode,
  RoofSegmentNode,
  type SceneGraph,
  SiteNode,
  SlabNode,
  StairNode,
  StairSegmentNode,
  WallNode,
  WindowNode,
  ZoneNode,
} from '@pascal-app/core'

type DemoKind = 'office' | 'lodging'
type NodeMap = Record<string, AnyNode>
type Point2D = [number, number]
type Rect = {
  x1: number
  z1: number
  x2: number
  z2: number
}

const X_MIN = -9
const X_MAX = 9
const Z_MIN = -4.2
const Z_MAX = 4.2
const STORY_HEIGHT = 3
const WALL_THICKNESS = 0.12
const WALL_HEIGHT = 2.8
const SHELL_POLYGON: Point2D[] = [
  [X_MIN, Z_MIN],
  [X_MAX, Z_MIN],
  [X_MAX, Z_MAX],
  [X_MIN, Z_MAX],
]

export interface DemoSceneGeneration {
  sceneGraph: SceneGraph
  projectName: string
  kind: DemoKind
  limitations: string[]
  summary: string
}

export function generateDemoSceneFromBrief(input: {
  brief: string
  projectName?: string
  constraints?: string
}): DemoSceneGeneration {
  const kind = detectDemoKind(input.brief)
  const projectName =
    input.projectName?.trim() || (kind === 'lodging' ? '模块化民宿 Demo' : '模块化办公楼 Demo')
  const sceneGraph =
    kind === 'lodging' ? buildLodgingScene(projectName) : buildOfficeScene(projectName)
  const limitations = [
    'MVP 使用确定性 Pascal 场景生成器承接 brief，适合稳定演示；完整 LLM/MCP 多轮生成可在后续接入。',
    '面积、BOM 和模块化率为方案阶段估算，未包含结构安全、运输吊装和工厂排产校核。',
  ]
  if (input.constraints?.trim()) {
    limitations.push('约束文本已记录在项目摘要中，本期不做逐条合规求解。')
  }

  return {
    sceneGraph,
    projectName,
    kind,
    limitations,
    summary:
      kind === 'lodging'
        ? '生成两层模块化民宿/宿舍方案，包含客房、公区、后勤空间、楼梯和屋面。'
        : '生成两层模块化办公方案，包含办公室、会议室、开放工位、卫生间、楼梯和屋面。',
  }
}

function detectDemoKind(brief: string): DemoKind {
  const normalized = brief.toLowerCase()
  if (
    normalized.includes('民宿') ||
    normalized.includes('宿舍') ||
    normalized.includes('酒店') ||
    normalized.includes('客房') ||
    normalized.includes('lodging') ||
    normalized.includes('hotel') ||
    normalized.includes('dorm')
  ) {
    return 'lodging'
  }
  return 'office'
}

function buildOfficeScene(projectName: string): SceneGraph {
  const nodes: NodeMap = {}
  const level0 = addStory(nodes, {
    level: 0,
    name: 'Level 1 - reception and shared work',
    zones: [
      zoneSpec('Reception / client area', '#38bdf8', { x1: -9, z1: -4.2, x2: -5, z2: 0 }),
      zoneSpec('Open work area', '#60a5fa', { x1: -5, z1: -4.2, x2: 4.5, z2: 4.2 }),
      zoneSpec('Meeting room', '#a78bfa', { x1: 4.5, z1: -4.2, x2: 9, z2: 1.2 }),
      zoneSpec('Toilet / MEP pod', '#34d399', { x1: 4.5, z1: 1.2, x2: 9, z2: 4.2 }),
      zoneSpec('Vertical circulation', '#f59e0b', { x1: -9, z1: 0, x2: -5, z2: 4.2 }),
    ],
    interiorWalls: [
      verticalWall(-5),
      verticalWall(4.5),
      horizontalWall(0, -9, -5),
      horizontalWall(1.2, 4.5, 9),
    ],
    exteriorDoor: true,
  })
  const level1 = addStory(nodes, {
    level: 1,
    name: 'Level 2 - private offices',
    zones: [
      zoneSpec('Office 1', '#93c5fd', { x1: -9, z1: -4.2, x2: -3, z2: 0 }),
      zoneSpec('Office 2', '#93c5fd', { x1: -3, z1: -4.2, x2: 3, z2: 0 }),
      zoneSpec('Office 3', '#93c5fd', { x1: 3, z1: -4.2, x2: 9, z2: 0 }),
      zoneSpec('Office 4', '#bfdbfe', { x1: -9, z1: 0, x2: -3, z2: 4.2 }),
      zoneSpec('Office 5', '#bfdbfe', { x1: -3, z1: 0, x2: 3, z2: 4.2 }),
      zoneSpec('Office 6', '#bfdbfe', { x1: 3, z1: 0, x2: 6.4, z2: 4.2 }),
      zoneSpec('Toilet pod', '#6ee7b7', { x1: 6.4, z1: 0, x2: 9, z2: 4.2 }),
    ],
    interiorWalls: [
      verticalWall(-3),
      verticalWall(3),
      verticalWall(6.4, 0, 4.2),
      horizontalWall(0),
    ],
  })
  const roofLevel = addRoofLevel(nodes)
  addStair(nodes, level0, level1)
  addColumns(nodes, level0)
  addColumns(nodes, level1)
  addRoot(nodes, projectName, [level0, level1, roofLevel])
  return finishGraph(nodes)
}

function buildLodgingScene(projectName: string): SceneGraph {
  const nodes: NodeMap = {}
  const level0 = addStory(nodes, {
    level: 0,
    name: 'Level 1 - public and guest modules',
    zones: [
      zoneSpec('Lobby / reception', '#38bdf8', { x1: -9, z1: -4.2, x2: -3, z2: 0.6 }),
      zoneSpec('Dining lounge', '#fbbf24', { x1: -3, z1: -4.2, x2: 3, z2: 4.2 }),
      zoneSpec('Guest suite A', '#c4b5fd', { x1: 3, z1: -4.2, x2: 9, z2: 0 }),
      zoneSpec('Guest suite B', '#ddd6fe', { x1: 3, z1: 0, x2: 9, z2: 4.2 }),
      zoneSpec('Back-of-house pod', '#6ee7b7', { x1: -9, z1: 0.6, x2: -3, z2: 4.2 }),
    ],
    interiorWalls: [
      verticalWall(-3),
      verticalWall(3),
      horizontalWall(0, 3, 9),
      horizontalWall(0.6, -9, -3),
    ],
    exteriorDoor: true,
  })
  const level1 = addStory(nodes, {
    level: 1,
    name: 'Level 2 - guest room modules',
    zones: [
      zoneSpec('Guest suite C', '#bfdbfe', { x1: -9, z1: -4.2, x2: -3, z2: 0 }),
      zoneSpec('Guest suite D', '#bfdbfe', { x1: -3, z1: -4.2, x2: 3, z2: 0 }),
      zoneSpec('Guest suite E', '#bfdbfe', { x1: 3, z1: -4.2, x2: 9, z2: 0 }),
      zoneSpec('Guest suite F', '#dbeafe', { x1: -9, z1: 0, x2: -3, z2: 4.2 }),
      zoneSpec('Service pod', '#6ee7b7', { x1: -3, z1: 0, x2: 1, z2: 4.2 }),
      zoneSpec('Shared terrace module', '#fda4af', { x1: 1, z1: 0, x2: 9, z2: 4.2 }),
    ],
    interiorWalls: [
      verticalWall(-3),
      verticalWall(1, 0, 4.2),
      verticalWall(3, -4.2, 0),
      horizontalWall(0),
    ],
  })
  const roofLevel = addRoofLevel(nodes)
  addStair(nodes, level0, level1)
  addColumns(nodes, level0)
  addColumns(nodes, level1)
  addRoot(nodes, projectName, [level0, level1, roofLevel])
  return finishGraph(nodes)
}

function addRoot(nodes: NodeMap, projectName: string, levelIds: string[]) {
  const building = BuildingNode.parse({
    id: 'building_demo',
    name: projectName,
    parentId: 'site_demo',
    children: levelIds,
  })
  nodes.building_demo = building
  nodes.site_demo = SiteNode.parse({
    id: 'site_demo',
    name: `${projectName} site`,
    polygon: {
      type: 'polygon',
      points: [
        [-16, -12],
        [16, -12],
        [16, 12],
        [-16, 12],
      ],
    },
    children: [building.id],
  })
}

function finishGraph(nodes: NodeMap): SceneGraph {
  return {
    nodes: nodes as Record<AnyNodeId, AnyNode>,
    rootNodeIds: ['site_demo'] as AnyNodeId[],
  }
}

function addStory(
  nodes: NodeMap,
  options: {
    level: number
    name: string
    zones: Array<{ name: string; color: string; rect: Rect }>
    interiorWalls: Array<{ start: Point2D; end: Point2D }>
    exteriorDoor?: boolean
  },
): string {
  const suffix = options.level === 0 ? 'l1' : 'l2'
  const levelId = `level_${suffix}`
  const children: string[] = []
  const wallIds: string[] = []

  const openingsByWall = new Map<string, string[]>()
  const exteriorWalls = [
    {
      id: `wall_${suffix}_north`,
      start: [X_MIN, Z_MIN] as Point2D,
      end: [X_MAX, Z_MIN] as Point2D,
    },
    { id: `wall_${suffix}_east`, start: [X_MAX, Z_MIN] as Point2D, end: [X_MAX, Z_MAX] as Point2D },
    {
      id: `wall_${suffix}_south`,
      start: [X_MAX, Z_MAX] as Point2D,
      end: [X_MIN, Z_MAX] as Point2D,
    },
    { id: `wall_${suffix}_west`, start: [X_MIN, Z_MAX] as Point2D, end: [X_MIN, Z_MIN] as Point2D },
  ]

  for (const [index, spec] of exteriorWalls.entries()) {
    wallIds.push(spec.id)
    openingsByWall.set(spec.id, [])
    if (index !== 3) {
      const windowId = `window_${suffix}_${index + 1}`
      nodes[windowId] = window(windowId, spec.id, wallLength(spec.start, spec.end) * 0.55)
      openingsByWall.get(spec.id)?.push(windowId)
    }
  }

  if (options.exteriorDoor) {
    const doorId = `door_${suffix}_entry`
    nodes[doorId] = door(doorId, `wall_${suffix}_south`, 9)
    openingsByWall.get(`wall_${suffix}_south`)?.push(doorId)
  }

  for (const spec of exteriorWalls) {
    nodes[spec.id] = wall(spec.id, levelId, spec.start, spec.end, openingsByWall.get(spec.id) ?? [])
    children.push(spec.id)
  }

  for (const [index, spec] of options.interiorWalls.entries()) {
    const wallId = `wall_${suffix}_partition_${index + 1}`
    const doorId = `door_${suffix}_partition_${index + 1}`
    nodes[doorId] = door(
      doorId,
      wallId,
      Math.max(0.9, wallLength(spec.start, spec.end) * 0.45),
      0.85,
    )
    nodes[wallId] = wall(wallId, levelId, spec.start, spec.end, [doorId])
    children.push(wallId)
  }

  const slabId = `slab_${suffix}`
  const ceilingId = `ceiling_${suffix}`
  nodes[slabId] = SlabNode.parse({
    id: slabId,
    parentId: levelId,
    name: `${options.name} floor cassette`,
    polygon: SHELL_POLYGON,
    materialPreset: 'concrete',
  })
  nodes[ceilingId] = CeilingNode.parse({
    id: ceilingId,
    parentId: levelId,
    name: `${options.name} ceiling cassette`,
    polygon: SHELL_POLYGON,
    height: WALL_HEIGHT,
    materialPreset: 'white',
  })
  children.push(slabId, ceilingId)

  for (const [index, spec] of options.zones.entries()) {
    const zoneId = `zone_${suffix}_${index + 1}`
    nodes[zoneId] = ZoneNode.parse({
      id: zoneId,
      parentId: levelId,
      name: spec.name,
      color: spec.color,
      polygon: rectPolygon(spec.rect),
      metadata: {
        moduleKind: 'space-module',
      },
    })
    children.push(zoneId)
  }

  nodes[levelId] = LevelNode.parse({
    id: levelId,
    name: options.name,
    parentId: 'building_demo',
    level: options.level,
    children,
  })
  return levelId
}

function addRoofLevel(nodes: NodeMap): string {
  const levelId = 'level_roof'
  const roofId = 'roof_demo'
  const segmentId = 'rseg_demo_main'
  nodes[segmentId] = RoofSegmentNode.parse({
    id: segmentId,
    parentId: roofId,
    name: 'Standard roof cassette',
    roofType: 'gable',
    width: 19,
    depth: 9.5,
    wallHeight: 0.5,
    roofHeight: 1.6,
    overhang: 0.35,
    materialPreset: 'roof-dark',
  })
  nodes[roofId] = RoofNode.parse({
    id: roofId,
    parentId: levelId,
    name: 'Roof module',
    position: [0, 0, 0],
    children: [segmentId],
  })
  nodes[levelId] = LevelNode.parse({
    id: levelId,
    name: 'Roof service level',
    parentId: 'building_demo',
    level: 2,
    children: [roofId],
    metadata: {
      levelKind: 'roof-support',
    },
  })
  return levelId
}

function addStair(nodes: NodeMap, fromLevelId: string, toLevelId: string) {
  const stairId = 'stair_demo'
  const segmentId = 'sseg_demo'
  nodes[segmentId] = StairSegmentNode.parse({
    id: segmentId,
    parentId: stairId,
    segmentType: 'stair',
    width: 1.2,
    length: 4.2,
    height: STORY_HEIGHT,
    stepCount: 16,
    materialPreset: 'wood',
  })
  nodes[stairId] = StairNode.parse({
    id: stairId,
    parentId: fromLevelId,
    name: 'Prefabricated stair module',
    position: [-7.2, 0, 2.3],
    rotation: 0,
    stairType: 'straight',
    fromLevelId,
    toLevelId,
    width: 1.2,
    totalRise: STORY_HEIGHT,
    stepCount: 16,
    railingMode: 'both',
    children: [segmentId],
    metadata: {
      bomSku: 'MH-STAIR-SET',
    },
  })
  appendChild(nodes, fromLevelId, stairId)
}

function addColumns(nodes: NodeMap, levelId: string) {
  const suffix = levelId.replace('level_', '')
  const positions: Array<[number, number, number]> = [
    [-8.2, 0, -3.5],
    [8.2, 0, -3.5],
    [-8.2, 0, 3.5],
    [8.2, 0, 3.5],
  ]
  for (const [index, position] of positions.entries()) {
    const id = `column_${suffix}_${index + 1}`
    nodes[id] = ColumnNode.parse({
      id,
      parentId: levelId,
      name: 'Steel post',
      crossSection: 'square',
      position,
      width: 0.18,
      depth: 0.18,
      height: WALL_HEIGHT,
      metadata: {
        bomSku: 'MH-COLUMN',
      },
    })
    appendChild(nodes, levelId, id)
  }
}

function appendChild(nodes: NodeMap, parentId: string, childId: string) {
  const parent = nodes[parentId]
  if (!parent || !('children' in parent) || !Array.isArray(parent.children)) return
  ;(parent.children as string[]).push(childId)
}

function wall(id: string, parentId: string, start: Point2D, end: Point2D, children: string[] = []) {
  return WallNode.parse({
    id,
    parentId,
    name: 'Standard wall panel run',
    children,
    thickness: WALL_THICKNESS,
    height: WALL_HEIGHT,
    start,
    end,
    materialPreset: 'white',
    metadata: {
      moduleKind: 'wall-panel',
    },
  }) as AnyNode
}

function door(id: string, wallId: string, offset: number, width = 0.95) {
  return DoorNode.parse({
    id,
    parentId: wallId,
    wallId,
    name: 'Door set',
    position: [offset, 1.05, 0],
    width,
    height: 2.1,
    metadata: {
      bomSku: 'MH-DOOR-SET',
    },
  }) as AnyNode
}

function window(id: string, wallId: string, offset: number) {
  return WindowNode.parse({
    id,
    parentId: wallId,
    wallId,
    name: 'Window set',
    position: [offset, 1.45, 0],
    width: 1.5,
    height: 1.2,
    columnRatios: [0.5, 0.5],
    metadata: {
      bomSku: 'MH-WINDOW-SET',
    },
  }) as AnyNode
}

function zoneSpec(name: string, color: string, rect: Rect) {
  return { name, color, rect }
}

function rectPolygon(rect: Rect): Point2D[] {
  return [
    [rect.x1, rect.z1],
    [rect.x2, rect.z1],
    [rect.x2, rect.z2],
    [rect.x1, rect.z2],
  ]
}

function verticalWall(x: number, z1 = Z_MIN, z2 = Z_MAX) {
  return { start: [x, z1] as Point2D, end: [x, z2] as Point2D }
}

function horizontalWall(z: number, x1 = X_MIN, x2 = X_MAX) {
  return { start: [x1, z] as Point2D, end: [x2, z] as Point2D }
}

function wallLength(start: Point2D, end: Point2D): number {
  return Math.hypot(end[0] - start[0], end[1] - start[1])
}
