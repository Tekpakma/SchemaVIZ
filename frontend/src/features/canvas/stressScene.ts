import type { CanvasEdge, CanvasNode } from './model/types'
import {
  DEFAULT_CANVAS_NODE_SHAPE,
  DEFAULT_CANVAS_NODE_SHAPE_NAME,
} from './nodeShapes'

const STRESS_SCENE_QUERY_PARAM = 'stress'
const STRESS_SCENE_MIN_NODES = 1
const STRESS_SCENE_MAX_NODES = 1000
const STRESS_SCENE_GAP_X = 64
const STRESS_SCENE_GAP_Y = 48
const STRESS_SCENE_START_X = 80
const STRESS_SCENE_START_Y = 80
const STRESS_SCENE_TITLE_PREFIXES = [
  'API',
  'AUTH',
  'CACHE',
  'DB',
  'EDGE',
  'ETL',
  'MQ',
  'WEB',
] as const
const STRESS_SCENE_METRICS = [
  'CPU Usage',
  'Latency',
  'Queue Depth',
  'Memory',
  'Requests',
  'Storage',
] as const
const STRESS_SCENE_ACCENT_COLORS = [
  '#2563eb',
  '#0891b2',
  '#16a34a',
  '#ca8a04',
  '#9333ea',
  '#dc2626',
] as const

function clampStressSceneNodeCount(count: number) {
  return Math.min(
    STRESS_SCENE_MAX_NODES,
    Math.max(STRESS_SCENE_MIN_NODES, count),
  )
}

function formatStressSceneNodeLabel(index: number) {
  const title =
    STRESS_SCENE_TITLE_PREFIXES[index % STRESS_SCENE_TITLE_PREFIXES.length]

  return `${title}_${String(index + 1).padStart(3, '0')}`
}

function createStressSceneNodeHtml(index: number) {
  const accentColor =
    STRESS_SCENE_ACCENT_COLORS[index % STRESS_SCENE_ACCENT_COLORS.length]
  const metric = STRESS_SCENE_METRICS[index % STRESS_SCENE_METRICS.length]
  const value = 24 + ((index * 17) % 71)

  return `
    <div style="font-family: sans-serif; padding: 10px; text-align: center;">
      <b style="color: ${accentColor};">${formatStressSceneNodeLabel(index)}</b>
      <div style="font-size: 11px; margin-top: 4px;">${metric}</div>
      <div style="color: gray; font-size: 10px;">Value: ${value}</div>
    </div>
  `
}

export function createStressSceneNodes(count: number): Array<CanvasNode> {
  const nodeCount = clampStressSceneNodeCount(count)
  const columnCount = Math.max(1, Math.ceil(Math.sqrt(nodeCount)))

  return Array.from({ length: nodeCount }, (_, index) => {
    const column = index % columnCount
    const row = Math.floor(index / columnCount)
    const widthOffset = (index % 3) * 18

    return {
      id: `stress-node-${index + 1}`,
      kind: 'editable',
      shape: DEFAULT_CANVAS_NODE_SHAPE_NAME,
      layoutMode: 'manual',
      appLabel: 'stress',
      modelName: 'service',
      x:
        STRESS_SCENE_START_X +
        column *
          (DEFAULT_CANVAS_NODE_SHAPE.defaultSize.width + STRESS_SCENE_GAP_X),
      y:
        STRESS_SCENE_START_Y +
        row *
          (DEFAULT_CANVAS_NODE_SHAPE.defaultSize.height + STRESS_SCENE_GAP_Y),
      width: DEFAULT_CANVAS_NODE_SHAPE.defaultSize.width + widthOffset,
      height: DEFAULT_CANVAS_NODE_SHAPE.defaultSize.height,
      lexicalJson: '',
      html: createStressSceneNodeHtml(index),
      contentHeight: 0,
      version: 1,
    }
  })
}

export function createStressSceneEdges(count: number): Array<CanvasEdge> {
  const nodeCount = clampStressSceneNodeCount(count)
  if (nodeCount < 2) return []

  return Array.from({ length: nodeCount - 1 }, (_, index) => ({
    id: `stress-edge-${index + 1}`,
    sourceNodeId: `stress-node-${index + 1}`,
    targetNodeId: `stress-node-${index + 2}`,
    kind: 'default',
  }))
}

export function getCanvasSeedNodesFromSearch(
  search: string | undefined,
): Array<CanvasNode> | null {
  const searchParams = new URLSearchParams(search)
  const stressSceneValue = searchParams.get(STRESS_SCENE_QUERY_PARAM)
  if (!stressSceneValue) return null

  const parsedNodeCount = Number.parseInt(stressSceneValue, 10)
  if (!Number.isFinite(parsedNodeCount)) return null

  return createStressSceneNodes(parsedNodeCount)
}

export function getCanvasSeedEdgesFromSearch(
  search: string | undefined,
): Array<CanvasEdge> | null {
  const searchParams = new URLSearchParams(search)
  const stressSceneValue = searchParams.get(STRESS_SCENE_QUERY_PARAM)
  if (!stressSceneValue) return null

  const parsedNodeCount = Number.parseInt(stressSceneValue, 10)
  if (!Number.isFinite(parsedNodeCount)) return null

  return createStressSceneEdges(parsedNodeCount)
}
