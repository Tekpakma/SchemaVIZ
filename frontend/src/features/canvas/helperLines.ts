import type { CanvasNode, NodeId } from './model/types'
import {
  CANVAS_HELPER_LINE_MAX_CANDIDATE_DISTANCE,
  CANVAS_HELPER_LINE_SNAP_RADIUS,
} from './constants'

export type CanvasNodeFrame = {
  id?: NodeId
  x: number
  y: number
  width: number
  height: number
}

export type CanvasHelperLineOrientation = 'horizontal' | 'vertical'

export type CanvasHelperLineAnchorName =
  | 'left'
  | 'centerX'
  | 'right'
  | 'top'
  | 'centerY'
  | 'bottom'

export type CanvasHelperLine = {
  orientation: CanvasHelperLineOrientation
  position: number
  sourceAnchorName: CanvasHelperLineAnchorName
  targetAnchorName: CanvasHelperLineAnchorName
  targetNodeId: NodeId
}

type HelperLineAnchor = {
  orientation: CanvasHelperLineOrientation
  resolve: (frame: CanvasNodeFrame) => number
}

type HelperLineMatch = {
  line: CanvasHelperLine
  sourcePosition: number
  lineDistance: number
  nodeDistance: number
}

export type CanvasHelperLineSnapResult = {
  x: number
  y: number
  lines: Array<CanvasHelperLine>
}

export type CanvasHelperLineSnapOptions = {
  excludeNodeIds?: Array<NodeId>
}

const HELPER_LINE_ANCHORS = {
  left: {
    orientation: 'vertical',
    resolve: (frame) => frame.x,
  },
  centerX: {
    orientation: 'vertical',
    resolve: (frame) => frame.x + frame.width / 2,
  },
  right: {
    orientation: 'vertical',
    resolve: (frame) => frame.x + frame.width,
  },
  top: {
    orientation: 'horizontal',
    resolve: (frame) => frame.y,
  },
  centerY: {
    orientation: 'horizontal',
    resolve: (frame) => frame.y + frame.height / 2,
  },
  bottom: {
    orientation: 'horizontal',
    resolve: (frame) => frame.y + frame.height,
  },
} satisfies Record<CanvasHelperLineAnchorName, HelperLineAnchor>

function isCenterAnchorName(anchorName: CanvasHelperLineAnchorName) {
  return anchorName === 'centerX' || anchorName === 'centerY'
}

function areCompatibleAnchorNames(
  sourceAnchorName: CanvasHelperLineAnchorName,
  targetAnchorName: CanvasHelperLineAnchorName,
) {
  const sourceIsCenter = isCenterAnchorName(sourceAnchorName)
  const targetIsCenter = isCenterAnchorName(targetAnchorName)

  if (sourceIsCenter || targetIsCenter) {
    return sourceAnchorName === targetAnchorName
  }

  return true
}

function getCanvasNodeFrame(node: CanvasNode): CanvasNodeFrame {
  return {
    id: node.id,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
  }
}

function getFrameDistance(a: CanvasNodeFrame, b: CanvasNodeFrame) {
  const dx = Math.max(0, Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width)))
  const dy = Math.max(
    0,
    Math.max(a.y - (b.y + b.height), b.y - (a.y + a.height)),
  )

  return Math.sqrt(dx * dx + dy * dy)
}

function shouldSkipCandidateNode(
  node: CanvasNode,
  sourceFrame: CanvasNodeFrame,
  excludeNodeIds: Set<NodeId>,
) {
  if (node.id === sourceFrame.id) return true
  if (excludeNodeIds.has(node.id)) return true
  if (node.parentGroupId === sourceFrame.id) return true
  if (node.parentGroupId && excludeNodeIds.has(node.parentGroupId)) return true

  return false
}

function isBetterMatch(
  candidate: HelperLineMatch,
  current: HelperLineMatch | null,
) {
  if (!current) return true
  if (candidate.lineDistance !== current.lineDistance) {
    return candidate.lineDistance < current.lineDistance
  }

  return candidate.nodeDistance < current.nodeDistance
}

function findBestHelperLineMatch({
  anchorName,
  excludeNodeIds,
  nodeIds,
  nodes,
  sourceFrame,
}: {
  anchorName: CanvasHelperLineAnchorName
  excludeNodeIds: Set<NodeId>
  nodeIds: Array<NodeId>
  nodes: Record<NodeId, CanvasNode>
  sourceFrame: CanvasNodeFrame
}) {
  const sourceAnchor = HELPER_LINE_ANCHORS[anchorName]
  const sourcePosition = sourceAnchor.resolve(sourceFrame)
  let bestMatch: HelperLineMatch | null = null

  for (const nodeId of nodeIds) {
    const node = nodes[nodeId]
    if (!node || shouldSkipCandidateNode(node, sourceFrame, excludeNodeIds)) {
      continue
    }

    const targetFrame = getCanvasNodeFrame(node)
    const nodeDistance = getFrameDistance(sourceFrame, targetFrame)
    if (nodeDistance > CANVAS_HELPER_LINE_MAX_CANDIDATE_DISTANCE) continue

    for (const targetAnchorName of Object.keys(
      HELPER_LINE_ANCHORS,
    ) as Array<CanvasHelperLineAnchorName>) {
      const targetAnchor = HELPER_LINE_ANCHORS[targetAnchorName]
      if (targetAnchor.orientation !== sourceAnchor.orientation) continue
      if (!areCompatibleAnchorNames(anchorName, targetAnchorName)) continue

      const targetPosition = targetAnchor.resolve(targetFrame)
      const lineDistance = Math.abs(targetPosition - sourcePosition)
      if (lineDistance > CANVAS_HELPER_LINE_SNAP_RADIUS) continue

      const candidate: HelperLineMatch = {
        line: {
          orientation: sourceAnchor.orientation,
          position: targetPosition,
          sourceAnchorName: anchorName,
          targetAnchorName,
          targetNodeId: node.id,
        },
        sourcePosition,
        lineDistance,
        nodeDistance,
      }

      if (isBetterMatch(candidate, bestMatch)) {
        bestMatch = candidate
      }
    }
  }

  return bestMatch
}

/**
 * Finds nearby node edge/center alignments and returns the snapped frame origin.
 * The search compares the moving frame's anchors against all non-excluded nodes.
 */
export function snapFrameToHelperLines({
  excludeNodeIds = [],
  frame,
  nodeIds,
  nodes,
}: {
  excludeNodeIds?: Array<NodeId>
  frame: CanvasNodeFrame
  nodeIds: Array<NodeId>
  nodes: Record<NodeId, CanvasNode>
}): CanvasHelperLineSnapResult {
  const excluded = new Set(excludeNodeIds)
  const result: CanvasHelperLineSnapResult = {
    x: frame.x,
    y: frame.y,
    lines: [],
  }
  let horizontalMatch: HelperLineMatch | null = null
  let verticalMatch: HelperLineMatch | null = null

  for (const anchorName of Object.keys(
    HELPER_LINE_ANCHORS,
  ) as Array<CanvasHelperLineAnchorName>) {
    const match = findBestHelperLineMatch({
      anchorName,
      excludeNodeIds: excluded,
      nodeIds,
      nodes,
      sourceFrame: frame,
    })
    if (!match) continue

    if (
      match.line.orientation === 'horizontal' &&
      isBetterMatch(match, horizontalMatch)
    ) {
      horizontalMatch = match
    }

    if (
      match.line.orientation === 'vertical' &&
      isBetterMatch(match, verticalMatch)
    ) {
      verticalMatch = match
    }
  }

  if (verticalMatch) {
    result.x -= verticalMatch.sourcePosition - verticalMatch.line.position
    result.lines.push(verticalMatch.line)
  }

  if (horizontalMatch) {
    result.y -= horizontalMatch.sourcePosition - horizontalMatch.line.position
    result.lines.push(horizontalMatch.line)
  }

  return result
}
