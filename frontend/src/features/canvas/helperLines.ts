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

export type CanvasHelperLineCandidate = {
  id: NodeId
  parentGroupId?: NodeId
  frame: CanvasNodeFrame
  horizontalTargets: Array<{
    name: CanvasHelperLineAnchorName
    position: number
  }>
  verticalTargets: Array<{
    name: CanvasHelperLineAnchorName
    position: number
  }>
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

const HELPER_LINE_ANCHOR_NAMES = Object.keys(
  HELPER_LINE_ANCHORS,
) as Array<CanvasHelperLineAnchorName>

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
  candidate: CanvasHelperLineCandidate,
  sourceFrame: CanvasNodeFrame,
  excludeNodeIds: Set<NodeId>,
) {
  if (candidate.id === sourceFrame.id) return true
  if (excludeNodeIds.has(candidate.id)) return true
  if (candidate.parentGroupId === sourceFrame.id) return true
  if (candidate.parentGroupId && excludeNodeIds.has(candidate.parentGroupId)) {
    return true
  }

  return false
}

export function createHelperLineCandidates({
  nodeIds,
  nodes,
}: {
  nodeIds: Array<NodeId>
  nodes: Record<NodeId, CanvasNode>
}): Array<CanvasHelperLineCandidate> {
  const candidates: Array<CanvasHelperLineCandidate> = []

  for (const nodeId of nodeIds) {
    const node = nodes[nodeId]
    if (!node) continue

    const frame = getCanvasNodeFrame(node)
    const horizontalTargets: CanvasHelperLineCandidate['horizontalTargets'] = []
    const verticalTargets: CanvasHelperLineCandidate['verticalTargets'] = []

    for (const anchorName of HELPER_LINE_ANCHOR_NAMES) {
      const anchor = HELPER_LINE_ANCHORS[anchorName]
      const target = {
        name: anchorName,
        position: anchor.resolve(frame),
      }

      if (anchor.orientation === 'horizontal') {
        horizontalTargets.push(target)
      } else {
        verticalTargets.push(target)
      }
    }

    candidates.push({
      id: node.id,
      parentGroupId: node.parentGroupId,
      frame,
      horizontalTargets,
      verticalTargets,
    })
  }

  return candidates
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
  candidates,
  excludeNodeIds,
  sourceFrame,
}: {
  anchorName: CanvasHelperLineAnchorName
  candidates: Array<CanvasHelperLineCandidate>
  excludeNodeIds: Set<NodeId>
  sourceFrame: CanvasNodeFrame
}) {
  const sourceAnchor = HELPER_LINE_ANCHORS[anchorName]
  const sourcePosition = sourceAnchor.resolve(sourceFrame)
  let bestMatch: HelperLineMatch | null = null

  for (const candidate of candidates) {
    if (shouldSkipCandidateNode(candidate, sourceFrame, excludeNodeIds)) {
      continue
    }

    const nodeDistance = getFrameDistance(sourceFrame, candidate.frame)
    if (nodeDistance > CANVAS_HELPER_LINE_MAX_CANDIDATE_DISTANCE) continue

    const targets =
      sourceAnchor.orientation === 'horizontal'
        ? candidate.horizontalTargets
        : candidate.verticalTargets

    for (const target of targets) {
      const targetAnchorName = target.name
      if (!areCompatibleAnchorNames(anchorName, targetAnchorName)) continue

      const lineDistance = Math.abs(target.position - sourcePosition)
      if (lineDistance > CANVAS_HELPER_LINE_SNAP_RADIUS) continue

      const candidateMatch: HelperLineMatch = {
        line: {
          orientation: sourceAnchor.orientation,
          position: target.position,
          sourceAnchorName: anchorName,
          targetAnchorName,
          targetNodeId: candidate.id,
        },
        sourcePosition,
        lineDistance,
        nodeDistance,
      }

      if (isBetterMatch(candidateMatch, bestMatch)) {
        bestMatch = candidateMatch
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
  candidates,
  excludeNodeIds = [],
  frame,
}: {
  candidates: Array<CanvasHelperLineCandidate>
  excludeNodeIds?: Array<NodeId>
  frame: CanvasNodeFrame
}): CanvasHelperLineSnapResult {
  const excluded = new Set(excludeNodeIds)
  const result: CanvasHelperLineSnapResult = {
    x: frame.x,
    y: frame.y,
    lines: [],
  }
  let horizontalMatch: HelperLineMatch | null = null
  let verticalMatch: HelperLineMatch | null = null

  for (const anchorName of HELPER_LINE_ANCHOR_NAMES) {
    const match = findBestHelperLineMatch({
      anchorName,
      candidates,
      excludeNodeIds: excluded,
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
