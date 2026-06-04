'use client'

import type { AnyNode, SceneGraph } from '@pascal-app/core'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import Link from 'next/link'
import { useMemo } from 'react'
import { DemoInfoPanel } from './demo-info-panel'

export interface SceneMeta {
  id: string
  name: string
  projectId: string | null
  thumbnailUrl: string | null
  version: number
  createdAt: string
  updatedAt: string
  ownerId: string | null
  sizeBytes: number
  nodeCount: number
}

interface SceneLoaderProps {
  initialScene: SceneGraph
  meta: SceneMeta
  demoInfo?: {
    projectName: string
  }
}

type SceneNode = AnyNode & {
  type?: string
  children?: Array<string | { id?: string }>
  position?: [number, number, number]
  rotation?: [number, number, number] | number
  visible?: boolean
  level?: number
  start?: [number, number]
  end?: [number, number]
  thickness?: number
  height?: number
  width?: number
  depth?: number
  length?: number
  totalRise?: number
  color?: string
  polygon?: { points?: Array<[number, number]> }
}

const STORY_HEIGHT = 3

export function SceneLoader({ demoInfo, initialScene, meta }: SceneLoaderProps) {
  const nodes = initialScene.nodes as Record<string, SceneNode>
  const rootNodeIds = initialScene.rootNodeIds

  const bounds = useMemo(() => collectSceneBounds(nodes), [nodes])
  const cameraPosition = useMemo(() => fitCamera(bounds), [bounds])

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute top-4 left-1/2 z-20 -translate-x-1/2">
        <div className="rounded-full border border-border bg-background/90 px-3 py-1 font-medium text-xs shadow-sm backdrop-blur">
          {meta.name}
        </div>
      </div>

      <div className="pointer-events-none absolute top-4 right-4 z-20 flex items-center gap-2">
        <Link
          className="pointer-events-auto rounded-md border border-border bg-background/90 px-3 py-1.5 font-medium text-xs shadow-sm backdrop-blur hover:bg-accent/40"
          href="/scenes"
        >
          All scenes
        </Link>
      </div>

      {demoInfo && (
        <div className="pointer-events-none absolute top-4 left-4 z-20">
          <DemoInfoPanel projectName={demoInfo.projectName} sceneGraph={initialScene} />
        </div>
      )}

      <Canvas
        camera={{ position: cameraPosition, fov: 38, near: 0.1, far: 500 }}
        dpr={[1, 1.5]}
        shadows
      >
        <color attach="background" args={['#f7f8fb']} />
        <fog attach="fog" args={['#f7f8fb', 45, 120]} />
        <ambientLight intensity={1.4} />
        <directionalLight
          castShadow
          intensity={2.3}
          position={[20, 28, 16]}
        />
        <hemisphereLight intensity={0.7} color="#ffffff" groundColor="#dbe4f0" />
        <SceneGraphPreview nodes={nodes} rootNodeIds={rootNodeIds} />
        <gridHelper args={[160, 80, '#d2d8e2', '#e7ebf1']} position={[0, -0.02, 0]} />
        <OrbitControls
          makeDefault
          enableDamping
          maxPolarAngle={Math.PI / 2 - 0.08}
          minDistance={10}
          maxDistance={140}
        />
      </Canvas>
    </div>
  )
}

function SceneGraphPreview({
  nodes,
  rootNodeIds,
}: {
  nodes: Record<string, SceneNode>
  rootNodeIds: string[]
}) {
  return (
    <group>
      {rootNodeIds.map((nodeId) => (
        <SceneNodeView key={nodeId} nodeId={nodeId} nodes={nodes} />
      ))}
    </group>
  )
}

function SceneNodeView({
  nodeId,
  nodes,
}: {
  nodeId: string
  nodes: Record<string, SceneNode>
}) {
  const node = nodes[nodeId]
  if (!node || node.visible === false) return null

  const position = resolvePosition(node)
  const rotation = resolveRotation(node)
  const childIds = resolveChildren(node)

  return (
    <group position={position} rotation={rotation}>
      <NodeMesh node={node} />
      {childIds.map((childId) => (
        <SceneNodeView key={`${node.id}:${childId}`} nodeId={childId} nodes={nodes} />
      ))}
    </group>
  )
}

function NodeMesh({ node }: { node: SceneNode }) {
  switch (node.type) {
    case 'site':
      return <SiteMesh node={node} />
    case 'building':
      return <BuildingMesh node={node} />
    case 'level':
      return <LevelMesh node={node} />
    case 'wall':
      return <WallMesh node={node} />
    case 'zone':
      return <ZoneMesh node={node} />
    case 'slab':
      return <SlabMesh node={node} />
    case 'ceiling':
      return <CeilingMesh node={node} />
    case 'roof':
      return <RoofMesh node={node} />
    case 'roof-segment':
      return <RoofSegmentMesh node={node} />
    case 'column':
      return <ColumnMesh node={node} />
    case 'door':
      return <DoorMesh node={node} />
    case 'window':
      return <WindowMesh node={node} />
    case 'stair':
      return <StairMesh node={node} />
    case 'item':
      return <ItemMesh node={node} />
    default:
      return null
  }
}

function SiteMesh({ node }: { node: SceneNode }) {
  const box = boundsFromPolygon(node.polygon?.points)
  if (!box) return null
  return (
    <mesh receiveShadow position={[box.centerX, -0.08, box.centerZ]}>
      <boxGeometry args={[box.width, 0.08, box.depth]} />
      <meshStandardMaterial color="#e6edf5" metalness={0} roughness={1} transparent opacity={0.22} />
    </mesh>
  )
}

function BuildingMesh({ node }: { node: SceneNode }) {
  const box = boundsFromPolygon(node.polygon?.points)
  if (!box) return null
  return (
    <mesh receiveShadow position={[box.centerX, 0.01, box.centerZ]}>
      <boxGeometry args={[box.width, 0.02, box.depth]} />
      <meshStandardMaterial color="#dce3ee" metalness={0} roughness={1} transparent opacity={0.18} />
    </mesh>
  )
}

function LevelMesh({ node }: { node: SceneNode }) {
  const box = boundsFromPolygon(node.polygon?.points)
  if (!box) return null
  return (
    <mesh receiveShadow position={[box.centerX, -0.04, box.centerZ]}>
      <boxGeometry args={[box.width, 0.08, box.depth]} />
      <meshStandardMaterial color="#d8dee8" metalness={0} roughness={1} transparent opacity={0.4} />
    </mesh>
  )
}

function WallMesh({ node }: { node: SceneNode }) {
  const start = node.start
  const end = node.end
  if (!(start && end)) return null
  const length = distance2d(start, end)
  const angle = Math.atan2(end[1] - start[1], end[0] - start[0])
  const thickness = node.thickness ?? 0.12
  const height = node.height ?? 2.8
  const center: [number, number, number] = [
    (start[0] + end[0]) / 2,
    height / 2,
    (start[1] + end[1]) / 2,
  ]

  return (
    <mesh castShadow receiveShadow position={center} rotation={[0, -angle, 0]}>
      <boxGeometry args={[length, height, thickness]} />
      <meshStandardMaterial color="#b7c0cc" roughness={0.94} metalness={0.02} />
    </mesh>
  )
}

function ZoneMesh({ node }: { node: SceneNode }) {
  const box = boundsFromPolygon(node.polygon?.points)
  if (!box) return null
  return (
      <mesh receiveShadow position={[box.centerX, 0.025, box.centerZ]}>
        <boxGeometry args={[box.width, 0.05, box.depth]} />
        <meshStandardMaterial
          color={node.color ?? '#93c5fd'}
          transparent
          opacity={0.35}
          roughness={0.9}
      />
    </mesh>
  )
}

function SlabMesh({ node }: { node: SceneNode }) {
  const box = boundsFromPolygon(node.polygon?.points)
  if (!box) return null
  return (
    <mesh receiveShadow position={[box.centerX, -0.12, box.centerZ]}>
      <boxGeometry args={[box.width, 0.18, box.depth]} />
      <meshStandardMaterial color="#d6d9df" roughness={1} metalness={0} />
    </mesh>
  )
}

function CeilingMesh({ node }: { node: SceneNode }) {
  const box = boundsFromPolygon(node.polygon?.points)
  if (!box) return null
  const y = typeof node.height === 'number' ? node.height : STORY_HEIGHT
  return (
    <mesh receiveShadow position={[box.centerX, y + 0.05, box.centerZ]}>
      <boxGeometry args={[box.width, 0.08, box.depth]} />
      <meshStandardMaterial color="#f5f7fa" roughness={1} metalness={0} />
    </mesh>
  )
}

function RoofMesh({ node }: { node: SceneNode }) {
  return (
    <mesh receiveShadow position={[0, 0.9, 0]}>
      <boxGeometry args={[19, 0.32, 9.5]} />
      <meshStandardMaterial color="#8f5a3e" roughness={0.94} metalness={0.02} />
    </mesh>
  )
}

function RoofSegmentMesh({ node }: { node: SceneNode }) {
  return (
    <mesh receiveShadow position={[0, (node.height ?? 1.5) / 2, 0]}>
      <boxGeometry args={[node.width ?? 19, node.height ?? 1.5, node.depth ?? 9.5]} />
      <meshStandardMaterial color="#946445" roughness={0.96} metalness={0.02} />
    </mesh>
  )
}

function ColumnMesh({ node }: { node: SceneNode }) {
  const position = node.position ?? [0, 0, 0]
  return (
    <mesh castShadow receiveShadow position={position}>
      <boxGeometry args={[node.width ?? 0.2, node.height ?? 3, node.depth ?? 0.2]} />
      <meshStandardMaterial color="#64748b" roughness={0.8} metalness={0.05} />
    </mesh>
  )
}

function DoorMesh({ node }: { node: SceneNode }) {
  const position = node.position ?? [0, 1, 0]
  return (
    <mesh castShadow receiveShadow position={position}>
      <boxGeometry args={[node.width ?? 0.95, node.height ?? 2.1, 0.06]} />
      <meshStandardMaterial color="#b58a62" roughness={0.88} metalness={0.02} />
    </mesh>
  )
}

function WindowMesh({ node }: { node: SceneNode }) {
  const position = node.position ?? [0, 1.4, 0]
  return (
    <mesh castShadow receiveShadow position={position}>
      <boxGeometry args={[node.width ?? 1.5, node.height ?? 1.2, 0.04]} />
      <meshStandardMaterial color="#9ad4f5" transparent opacity={0.65} roughness={0.1} metalness={0.02} />
    </mesh>
  )
}

function StairMesh({ node }: { node: SceneNode }) {
  const position = node.position ?? [0, 0, 0]
  return (
    <mesh castShadow receiveShadow position={position}>
      <boxGeometry args={[node.width ?? 1.2, node.totalRise ?? 3, node.length ?? 4.2]} />
      <meshStandardMaterial color="#8d6f57" roughness={0.92} metalness={0.02} />
    </mesh>
  )
}

function ItemMesh({ node }: { node: SceneNode }) {
  const position = node.position ?? [0, 0, 0]
  return (
    <mesh castShadow receiveShadow position={position}>
      <boxGeometry args={[0.6, 0.6, 0.6]} />
      <meshStandardMaterial color="#90a4b8" roughness={0.75} metalness={0.03} />
    </mesh>
  )
}

function resolveChildren(node: SceneNode): string[] {
  if (!Array.isArray(node.children)) return []
  return node.children
    .map((child: string | { id?: string }) => {
      if (typeof child === 'string') return child
      if (child && typeof child === 'object' && typeof child.id === 'string') return child.id
      return null
    })
    .filter((id: string | null): id is string => typeof id === 'string')
}

function resolvePosition(node: SceneNode): [number, number, number] {
  if (Array.isArray(node.position) && node.position.length >= 3) {
    return [node.position[0] ?? 0, node.position[1] ?? 0, node.position[2] ?? 0]
  }
  if (node.type === 'level') {
    return [0, (node.level ?? 0) * STORY_HEIGHT, 0]
  }
  return [0, 0, 0]
}

function resolveRotation(node: SceneNode): [number, number, number] {
  if (Array.isArray(node.rotation)) {
    return [
      node.rotation[0] ?? 0,
      node.rotation[1] ?? 0,
      node.rotation[2] ?? 0,
    ]
  }
  if (typeof node.rotation === 'number') {
    return [0, node.rotation, 0]
  }
  return [0, 0, 0]
}

function boundsFromPolygon(points?: Array<[number, number]>) {
  if (!(points && points.length > 0)) return null
  let minX = Number.POSITIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY
  for (const [x, z] of points) {
    minX = Math.min(minX, x)
    minZ = Math.min(minZ, z)
    maxX = Math.max(maxX, x)
    maxZ = Math.max(maxZ, z)
  }
  if (!(Number.isFinite(minX) && Number.isFinite(minZ) && Number.isFinite(maxX) && Number.isFinite(maxZ))) {
    return null
  }
  return {
    centerX: (minX + maxX) / 2,
    centerZ: (minZ + maxZ) / 2,
    width: Math.max(0.1, maxX - minX),
    depth: Math.max(0.1, maxZ - minZ),
  }
}

function collectSceneBounds(nodes: Record<string, SceneNode>) {
  const xs: number[] = []
  const zs: number[] = []

  for (const node of Object.values(nodes)) {
    if (Array.isArray(node.polygon?.points)) {
      for (const [x, z] of node.polygon.points) {
        xs.push(x)
        zs.push(z)
      }
    }
    if (Array.isArray(node.start) && Array.isArray(node.end)) {
      xs.push(node.start[0], node.end[0])
      zs.push(node.start[1], node.end[1])
    }
    if (Array.isArray(node.position)) {
      xs.push(node.position[0])
      zs.push(node.position[2] ?? 0)
    }
  }

  if (xs.length === 0 || zs.length === 0) {
    return { width: 32, depth: 24, centerX: 0, centerZ: 0 }
  }

  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minZ = Math.min(...zs)
  const maxZ = Math.max(...zs)

  return {
    width: Math.max(8, maxX - minX),
    depth: Math.max(8, maxZ - minZ),
    centerX: (minX + maxX) / 2,
    centerZ: (minZ + maxZ) / 2,
  }
}

function fitCamera(bounds: { width: number; depth: number; centerX: number; centerZ: number }) {
  const span = Math.max(bounds.width, bounds.depth)
  const distance = Math.max(18, span * 1.2)
  return [bounds.centerX + distance * 0.7, distance * 0.75, bounds.centerZ + distance * 0.7] as const
}

function distance2d(start: [number, number], end: [number, number]) {
  return Math.hypot(end[0] - start[0], end[1] - start[1])
}
