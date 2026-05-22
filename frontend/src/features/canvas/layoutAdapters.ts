import type {
  ElkExtendedEdge,
  ElkNode,
  ElkPort,
  LayoutOptions,
} from 'elkjs/lib/elk-api'
import type {
  SchemaEdgeOutput,
  SchemaGraphOutput,
  SchemaNodeOutput,
} from '@/api/contracts'
import type { CanvasLayoutInput } from './layout.schemas'
import { CANVAS_NODE_SHAPES } from './nodeShapes'
import {
  getParentNodeIdByNodeId,
  isRenderableCanvasEdge,
} from './compoundGraph'
import { resolveGroupLayoutOptions } from './groupLayout'
import type {
  CanvasEdge,
  CanvasFlowDirection,
  CanvasEdgeKind,
  CanvasGraphLayoutResult,
  CanvasNode,
  CanvasNodeFrame,
  CanvasPoint,
  CanvasPortRef,
  CanvasPortSide,
  NodeId,
} from './model/types'
import { escapeHtml } from '@/utils/html'
import * as R from 'remeda'
import { layout } from 'render-tag'
import { renderTagAccuracy } from '@/features/lexical/exportRenderTagHtml'
import {
  SCHEMA_NODE_FIELD_COLOR,
  SCHEMA_NODE_SUBTITLE_COLOR,
  SCHEMA_NODE_TITLE_COLOR,
} from './themeColors'

import {
  DEFAULT_ELK_LAYOUT_OPTIONS,
  ELK_PORT_CONSTRAINTS_OPTION,
  ELK_PORT_SIDE_OPTION,
} from '@/features/elk/constants'

import { prepareWithSegments, measureNaturalWidth } from '@chenglou/pretext'
import { createIsomorphicFn } from '@tanstack/react-start'

export type SchemaGraphNode = SchemaNodeOutput
export type SchemaGraphEdge = SchemaEdgeOutput
export type SchemaGraphPayload = SchemaGraphOutput

export type SchemaCanvasGraph = {
  nodes: Array<CanvasNode>
  edges: Array<CanvasEdge>
}

type ElkDirection = 'RIGHT' | 'LEFT' | 'DOWN' | 'UP'
type ElkPortSide = 'EAST' | 'WEST' | 'NORTH' | 'SOUTH'
type CanvasRect = Pick<CanvasNodeFrame, 'height' | 'width' | 'x' | 'y'>
type EdgeEndpoint = 'source' | 'target'

export const DEFAULT_CANVAS_FLOW_DIRECTION: CanvasFlowDirection = 'LR'

const ELK_PORT_SIDE_BY_CANVAS_PORT_SIDE: Record<CanvasPortSide, ElkPortSide> = {
  LEFT: 'WEST',
  RIGHT: 'EAST',
  TOP: 'NORTH',
  BOTTOM: 'SOUTH',
}

const PORT_ID_SEPARATOR = ':port:'

const SOURCE_PORT_SIDE_BY_FLOW_DIRECTION: Record<
  CanvasFlowDirection,
  CanvasPortSide
> = {
  LR: 'RIGHT',
  RL: 'LEFT',
  TB: 'BOTTOM',
  BT: 'TOP',
}

const TARGET_PORT_SIDE_BY_FLOW_DIRECTION: Record<
  CanvasFlowDirection,
  CanvasPortSide
> = {
  LR: 'LEFT',
  RL: 'RIGHT',
  TB: 'TOP',
  BT: 'BOTTOM',
}

const SCHEMA_GROUP_PREFIX = 'schema-group:'

/** Directional algorithms (layered, mrtree) use elk.direction + fixed-side ports.
 *  Non-directional algorithms (radial, force) ignore direction and need free ports. */
function isDirectionalAlgorithm(layoutOptions?: LayoutOptions): boolean {
  const algorithm = layoutOptions?.['elk.algorithm']
  return !algorithm || algorithm === 'layered' || algorithm === 'mrtree'
}

function getElkDirectionForCanvasFlowDirection(
  flowDirection: CanvasFlowDirection,
): ElkDirection {
  switch (flowDirection) {
    case 'RL':
      return 'LEFT'
    case 'TB':
      return 'DOWN'
    case 'BT':
      return 'UP'
    case 'LR':
    default:
      return 'RIGHT'
  }
}

function isHorizontalCanvasFlowDirection(flowDirection: CanvasFlowDirection) {
  return flowDirection === 'LR' || flowDirection === 'RL'
}

function clampToRange(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function getNodeCenter(node: CanvasRect): CanvasPoint {
  return {
    x: node.x + node.width / 2,
    y: node.y + node.height / 2,
  }
}

/** Resolves the active canvas flow direction, preferring explicit canvas state over raw ELK options. */
export function getCanvasFlowDirection(
  flowDirection?: CanvasFlowDirection,
  layoutOptions?: LayoutOptions,
): CanvasFlowDirection {
  if (flowDirection) {
    return flowDirection
  }

  switch (layoutOptions?.['elk.direction']) {
    case 'LEFT':
      return 'RL'
    case 'DOWN':
      return 'TB'
    case 'UP':
      return 'BT'
    case 'RIGHT':
    default:
      return DEFAULT_CANVAS_FLOW_DIRECTION
  }
}

/** Determines which side an edge endpoint should use, honoring explicit edge intent before flow defaults. */
export function resolveEdgePortSide(
  portRef: CanvasPortRef | undefined,
  endpoint: EdgeEndpoint,
  flowDirection?: CanvasFlowDirection,
  layoutOptions?: LayoutOptions,
): CanvasPortSide {
  if (portRef?.side) {
    return portRef.side
  }

  const effectiveFlowDirection = getCanvasFlowDirection(
    flowDirection,
    layoutOptions,
  )
  return endpoint === 'source'
    ? SOURCE_PORT_SIDE_BY_FLOW_DIRECTION[effectiveFlowDirection]
    : TARGET_PORT_SIDE_BY_FLOW_DIRECTION[effectiveFlowDirection]
}

function createElkPortId(nodeId: NodeId, side: CanvasPortSide) {
  return `${nodeId}${PORT_ID_SEPARATOR}${side}`
}

function getNodeIdFromElkPortId(elementId: string) {
  return elementId.split(PORT_ID_SEPARATOR)[0] ?? elementId
}

function createElkPortsForNode(node: CanvasNode): Array<ElkPort> {
  const sides: Array<CanvasPortSide> = ['LEFT', 'RIGHT', 'TOP', 'BOTTOM']

  return sides.map((side) => ({
    id: createElkPortId(node.id, side),
    width: 0,
    height: 0,
    layoutOptions: {
      [ELK_PORT_SIDE_OPTION]: ELK_PORT_SIDE_BY_CANVAS_PORT_SIDE[side],
    },
  }))
}

/** Projects a side-constrained anchor onto a node boundary while preserving the relevant axis from the reference point. */
export function getPortAnchorPoint(
  node: CanvasRect,
  side: CanvasPortSide,
  referencePoint: CanvasPoint,
): CanvasPoint {
  const minX = node.x
  const maxX = node.x + node.width
  const minY = node.y
  const maxY = node.y + node.height

  switch (side) {
    case 'LEFT':
      return {
        x: minX,
        y: clampToRange(referencePoint.y, minY, maxY),
      }
    case 'RIGHT':
      return {
        x: maxX,
        y: clampToRange(referencePoint.y, minY, maxY),
      }
    case 'TOP':
      return {
        x: clampToRange(referencePoint.x, minX, maxX),
        y: minY,
      }
    case 'BOTTOM':
      return {
        x: clampToRange(referencePoint.x, minX, maxX),
        y: maxY,
      }
    default:
      return getNodeCenter(node)
  }
}

/** Explicit ports stay pinned to the center of their chosen side so manual node moves do not slide anchors. */
function getFixedPortAnchorPoint(
  node: CanvasRect,
  side: CanvasPortSide,
  portRef: CanvasPortRef,
) {
  if (
    portRef.slot === undefined ||
    !portRef.slotCount ||
    portRef.slotCount < 2
  ) {
    return getPortAnchorPoint(node, side, getNodeCenter(node))
  }

  const lanePosition = (portRef.slot + 1) / (portRef.slotCount + 1)

  switch (side) {
    case 'LEFT':
      return {
        x: node.x,
        y: node.y + node.height * lanePosition,
      }
    case 'RIGHT':
      return {
        x: node.x + node.width,
        y: node.y + node.height * lanePosition,
      }
    case 'TOP':
      return {
        x: node.x + node.width * lanePosition,
        y: node.y,
      }
    case 'BOTTOM':
      return {
        x: node.x + node.width * lanePosition,
        y: node.y + node.height,
      }
    default:
      return getPortAnchorPoint(node, side, getNodeCenter(node))
  }
}

function dedupeRoutePoints(points: Array<CanvasPoint>) {
  return points.filter((point, index, allPoints) => {
    if (index === 0) {
      return true
    }

    const previousPoint = allPoints[index - 1]
    if (!previousPoint) {
      return true
    }

    return previousPoint.x !== point.x || previousPoint.y !== point.y
  })
}

/** Builds the local orthogonal fallback route when no ELK route is present, using the resolved endpoint sides. */
export function createFallbackEdgeRoute(
  edge: CanvasEdge,
  nodes: Record<NodeId, CanvasNode | CanvasNodeFrame>,
  flowDirection?: CanvasFlowDirection,
  layoutOptions?: LayoutOptions,
): Array<CanvasPoint> | null {
  const sourceNode = nodes[edge.sourceNodeId]
  const targetNode = nodes[edge.targetNodeId]
  if (!sourceNode || !targetNode) {
    return null
  }

  const effectiveFlowDirection = getCanvasFlowDirection(
    flowDirection,
    layoutOptions,
  )
  const sourceCenter = getNodeCenter(sourceNode)
  const targetCenter = getNodeCenter(targetNode)
  const sourceSide = resolveEdgePortSide(
    edge.sourcePort,
    'source',
    effectiveFlowDirection,
    layoutOptions,
  )
  const targetSide = resolveEdgePortSide(
    edge.targetPort,
    'target',
    effectiveFlowDirection,
    layoutOptions,
  )
  const sourceAnchor = edge.sourcePort?.side
    ? getFixedPortAnchorPoint(sourceNode, sourceSide, edge.sourcePort)
    : getPortAnchorPoint(sourceNode, sourceSide, targetCenter)
  const targetAnchor = edge.targetPort?.side
    ? getFixedPortAnchorPoint(targetNode, targetSide, edge.targetPort)
    : getPortAnchorPoint(targetNode, targetSide, sourceCenter)

  if (isHorizontalCanvasFlowDirection(effectiveFlowDirection)) {
    const midX = sourceAnchor.x + (targetAnchor.x - sourceAnchor.x) / 2
    return dedupeRoutePoints([
      sourceAnchor,
      {
        x: midX,
        y: sourceAnchor.y,
      },
      {
        x: midX,
        y: targetAnchor.y,
      },
      targetAnchor,
    ])
  }

  const midY = sourceAnchor.y + (targetAnchor.y - sourceAnchor.y) / 2
  return dedupeRoutePoints([
    sourceAnchor,
    {
      x: sourceAnchor.x,
      y: midY,
    },
    {
      x: targetAnchor.x,
      y: midY,
    },
    targetAnchor,
  ])
}

function getDirectChildIds(input: CanvasLayoutInput, parentId: NodeId) {
  return input.childIdsByGroupId[parentId] ?? []
}

function hasInternalEdges(
  input: CanvasLayoutInput,
  groupId: NodeId,
  childIds: Array<NodeId>,
): boolean {
  if (childIds.length < 2) return false
  const childIdSet = new Set(childIds)
  for (const edgeId of input.edgeOrder) {
    const edge = input.edgesById[edgeId]
    if (!edge) continue
    if (childIdSet.has(edge.sourceNodeId) && childIdSet.has(edge.targetNodeId)) {
      return true
    }
  }
  // groupId unused for now (edges live at root); keep param so future
  // sub-graph-aware traversal can scope without re-introducing the check.
  void groupId
  return false
}

/** Recursively converts a canvas node subtree into an ELK node tree and attaches fixed-side ports for routing. */
function createElkNode(
  input: CanvasLayoutInput,
  node: CanvasNode,
  directional: boolean,
): ElkNode {
  const childIds = getDirectChildIds(input, node.id)
  const children = R.pipe(
    childIds,
    R.flatMap((childId) => {
      const childNode = input.nodesById[childId]
      if (!childNode) {
        return []
      }

      return [createElkNode(input, childNode, directional)]
    }),
  )

  const layoutOptions: LayoutOptions = {
    [ELK_PORT_CONSTRAINTS_OPTION]: directional ? 'FIXED_SIDE' : 'FREE',
  }

  // Group nodes delegate inner layout to ELK via SEPARATE_CHILDREN; ELK
  // computes both child positions and the group's own dimensions during
  // the layout pass, so we don't preset width/height here.
  let width: number | undefined = node.width
  let height: number | undefined = node.height

  if (node.kind === 'group') {
    const { layoutOptions: groupOptions } = resolveGroupLayoutOptions(
      node,
      hasInternalEdges(input, node.id, childIds),
    )
    Object.assign(layoutOptions, groupOptions)
    width = undefined
    height = undefined
  }

  return {
    id: node.id,
    x: node.x,
    y: node.y,
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
    ports: createElkPortsForNode(node),
    layoutOptions,
    ...(children.length > 0 ? { children } : {}),
  }
}

function isValidLayoutEdge(
  input: CanvasLayoutInput,
  edge: CanvasEdge,
  parentNodeIdByNodeId: Map<NodeId, NodeId>,
) {
  return Boolean(
    input.nodesById[edge.sourceNodeId] &&
    input.nodesById[edge.targetNodeId] &&
    isRenderableCanvasEdge(edge, parentNodeIdByNodeId),
  )
}

const EDGE_LABEL_FONT = '10px sans-serif'
const EDGE_LABEL_PADDING_X = 4
const EDGE_LABEL_PADDING_Y = 2
const EDGE_LABEL_FONT_SIZE = 10

const measureEdgeLabel = createIsomorphicFn()
  .server((text: string) => {
    // Todo: Check if we can get pretext working in the server environment and switch to it .
    const width = text.length * EDGE_LABEL_FONT_SIZE * 0.6
    return {
      width: width + EDGE_LABEL_PADDING_X * 2,
      height: EDGE_LABEL_FONT_SIZE + EDGE_LABEL_PADDING_Y * 2,
    }
  })
  .client((text: string) => {
    const prepared = prepareWithSegments(text, EDGE_LABEL_FONT)
    const width = measureNaturalWidth(prepared)
    return {
      width: width + EDGE_LABEL_PADDING_X * 2,
      height: EDGE_LABEL_FONT_SIZE + EDGE_LABEL_PADDING_Y * 2,
    }
  })

/** Maps a canvas edge onto ELK port endpoints so ELK can honor side constraints during layout and routing. */
function createElkEdge(
  edge: CanvasEdge,
  flowDirection: CanvasFlowDirection,
  layoutOptions?: LayoutOptions,
): ElkExtendedEdge {
  const directional = isDirectionalAlgorithm(layoutOptions)

  // Non-directional algorithms (radial, force): connect edges directly to
  // node IDs so ELK picks the best attachment point freely.
  // Directional algorithms: route through fixed-side ports.
  const sources = directional
    ? [
        createElkPortId(
          edge.sourceNodeId,
          resolveEdgePortSide(edge.sourcePort, 'source', flowDirection, layoutOptions),
        ),
      ]
    : [edge.sourceNodeId]
  const targets = directional
    ? [
        createElkPortId(
          edge.targetNodeId,
          resolveEdgePortSide(edge.targetPort, 'target', flowDirection, layoutOptions),
        ),
      ]
    : [edge.targetNodeId]

  return {
    id: edge.id,
    sources,
    targets,
    ...(edge.label
      ? {
          labels: [
            {
              id: `${edge.id}:label`,
              text: edge.label,
              ...measureEdgeLabel(edge.label),
            },
          ],
        }
      : {}),
  }
}

/** Builds the root ELK graph from canvas state, resolving flow direction once for both node ports and edge endpoints. */
export function createElkGraph(input: CanvasLayoutInput): ElkNode {
  const flowDirection = getCanvasFlowDirection(
    input.flowDirection,
    input.layoutOptions,
  )
  const parentNodeIdByNodeId = getParentNodeIdByNodeId(
    Object.values(input.nodesById),
  )
  const directional = isDirectionalAlgorithm(input.layoutOptions)
  const rootChildren = R.pipe(
    input.nodeOrder,
    R.flatMap((nodeId) => {
      const node = input.nodesById[nodeId]
      if (!node || node.parentGroupId) {
        return []
      }

      return [createElkNode(input, node, directional)]
    }),
  )

  const edges = R.pipe(
    input.edgeOrder,
    R.flatMap((edgeId) => {
      const edge = input.edgesById[edgeId]
      if (!edge || !isValidLayoutEdge(input, edge, parentNodeIdByNodeId)) {
        return []
      }

      return [createElkEdge(edge, flowDirection, input.layoutOptions)]
    }),
  )

  // Directional algorithms get Layered defaults as base + explicit direction.
  // Non-directional algorithms (radial, force) use only their own config —
  // Layered defaults (elk.direction, elk.edgeRouting, layered.* spacing)
  // would conflict with how radial/force arrange nodes.
  const rootLayoutOptions: LayoutOptions = directional
    ? {
        ...DEFAULT_ELK_LAYOUT_OPTIONS,
        ...input.layoutOptions,
        'elk.direction': getElkDirectionForCanvasFlowDirection(flowDirection),
      }
    : { ...input.layoutOptions }

  return {
    id: 'root',
    layoutOptions: rootLayoutOptions,
    children: rootChildren,
    edges,
  }
}

function collectNodeFrames(
  node: ElkNode,
  parentOffset: CanvasPoint,
  frames: Array<CanvasNodeFrame>,
) {
  const x = parentOffset.x + (node.x ?? 0)
  const y = parentOffset.y + (node.y ?? 0)

  if (node.id !== 'root') {
    frames.push({
      id: node.id,
      x,
      y,
      width: node.width ?? 0,
      height: node.height ?? 0,
    })
  }

  for (const child of node.children ?? []) {
    collectNodeFrames(child, { x, y }, frames)
  }
}

function isPointInsideFrame(point: CanvasPoint, frame: CanvasNodeFrame) {
  return (
    point.x > frame.x &&
    point.x < frame.x + frame.width &&
    point.y > frame.y &&
    point.y < frame.y + frame.height
  )
}

/** Clips an interior route point to the first intersection with the node frame so rendered edges start at the boundary. */
function clipRoutePointToFrameBoundary(
  point: CanvasPoint,
  adjacentPoint: CanvasPoint,
  frame: CanvasNodeFrame,
) {
  if (
    !isPointInsideFrame(point, frame) ||
    isPointInsideFrame(adjacentPoint, frame)
  ) {
    return point
  }

  const deltaX = adjacentPoint.x - point.x
  const deltaY = adjacentPoint.y - point.y
  if (deltaX === 0 && deltaY === 0) {
    return point
  }

  const minX = frame.x
  const maxX = frame.x + frame.width
  const minY = frame.y
  const maxY = frame.y + frame.height
  const candidates: Array<{ point: CanvasPoint; t: number }> = []

  const addCandidate = (t: number) => {
    if (t <= 0 || t > 1) {
      return
    }

    const x = point.x + deltaX * t
    const y = point.y + deltaY * t
    if (x < minX || x > maxX || y < minY || y > maxY) {
      return
    }

    candidates.push({
      point: {
        x: Math.min(maxX, Math.max(minX, x)),
        y: Math.min(maxY, Math.max(minY, y)),
      },
      t,
    })
  }

  if (deltaX !== 0) {
    addCandidate((minX - point.x) / deltaX)
    addCandidate((maxX - point.x) / deltaX)
  }

  if (deltaY !== 0) {
    addCandidate((minY - point.y) / deltaY)
    addCandidate((maxY - point.y) / deltaY)
  }

  const clippedCandidate = candidates.reduce<
    (typeof candidates)[number] | undefined
  >((min, c) => (!min || c.t < min.t ? c : min), undefined)
  return clippedCandidate?.point ?? point
}

function getSectionPoints(edge: ElkExtendedEdge): Array<CanvasPoint> {
  const section = edge.sections?.[0]
  if (!section) return []

  return [
    section.startPoint,
    ...(section.bendPoints ?? []),
    section.endPoint,
  ].map((point) => ({
    x: point.x,
    y: point.y,
  }))
}

function getEdgeLabelPoint(
  edge: ElkExtendedEdge,
  routePoints: Array<CanvasPoint>,
): CanvasPoint | undefined {
  const label = edge.labels?.[0]
  if (typeof label?.x !== 'number' || typeof label.y !== 'number') {
    return undefined
  }

  if (label.x === 0 && label.y === 0 && routePoints.length >= 2) {
    return undefined
  }

  return {
    x: label.x + (label.width ?? 0) / 2,
    y: label.y + (label.height ?? 0) / 2,
  }
}

/** Adjusts the first and last route points against the owning node frames, even when ELK edges target port IDs. */
function clipEdgeRoutePoints(
  edge: ElkExtendedEdge,
  points: Array<CanvasPoint>,
  nodeFramesById: Record<NodeId, CanvasNodeFrame>,
) {
  if (points.length < 2) {
    return points
  }

  const clippedPoints = [...points]
  const firstPoint = clippedPoints[0]
  const secondPoint = clippedPoints[1]
  const lastIndex = clippedPoints.length - 1
  const lastPoint = clippedPoints[lastIndex]
  const previousPoint = clippedPoints[lastIndex - 1]
  if (!firstPoint || !secondPoint || !lastPoint || !previousPoint) {
    return points
  }

  const sourceNodeId = edge.sources[0]
    ? getNodeIdFromElkPortId(edge.sources[0])
    : undefined
  const targetNodeId = edge.targets[0]
    ? getNodeIdFromElkPortId(edge.targets[0])
    : undefined
  const sourceFrame = sourceNodeId ? nodeFramesById[sourceNodeId] : undefined
  const targetFrame = targetNodeId ? nodeFramesById[targetNodeId] : undefined

  if (sourceFrame) {
    clippedPoints[0] = clipRoutePointToFrameBoundary(
      firstPoint,
      secondPoint,
      sourceFrame,
    )
  }

  if (targetFrame) {
    clippedPoints[lastIndex] = clipRoutePointToFrameBoundary(
      lastPoint,
      previousPoint,
      targetFrame,
    )
  }

  return clippedPoints
}

/** Converts ELK layout output back into canvas node frames and clipped edge polylines. */
export function createGraphLayoutResult(
  laidOutGraph: ElkNode,
): CanvasGraphLayoutResult {
  const nodeFrames: Array<CanvasNodeFrame> = []
  collectNodeFrames(laidOutGraph, { x: 0, y: 0 }, nodeFrames)
  const nodeFramesById = R.indexBy(nodeFrames, R.prop('id'))

  const edgeRoutes = R.pipe(
    laidOutGraph.edges ?? [],
    R.flatMap((edge) => {
      const points = clipEdgeRoutePoints(
        edge,
        getSectionPoints(edge),
        nodeFramesById,
      )
      if (points.length < 2 || !edge.id) return []

      const labelPoint = getEdgeLabelPoint(edge, points)

      return [
        {
          id: edge.id,
          ...(labelPoint ? { labelPoint } : {}),
          points,
        },
      ]
    }),
  )

  return {
    nodeFrames,
    edgeRoutes,
  }
}

/** Normalizes a schema-derived graph into the canvas layout input shape, including group lookup tables and ordering. */
export function createCanvasLayoutInputFromGraph(
  graph: SchemaCanvasGraph,
  flowDirection: CanvasFlowDirection = DEFAULT_CANVAS_FLOW_DIRECTION,
  layoutOptions?: LayoutOptions,
): CanvasLayoutInput {
  const nodesById = R.indexBy(graph.nodes, R.prop('id'))
  const childIdsByGroupId: Record<NodeId, Array<NodeId>> = {}

  for (const node of graph.nodes) {
    if (!node.parentGroupId) {
      continue
    }

    const childIds = childIdsByGroupId[node.parentGroupId] ?? []
    childIds.push(node.id)
    childIdsByGroupId[node.parentGroupId] = childIds
  }

  return {
    nodesById,
    nodeOrder: R.map(graph.nodes, R.prop('id')),
    childIdsByGroupId,
    edgesById: R.indexBy(graph.edges, R.prop('id')),
    edgeOrder: R.map(graph.edges, R.prop('id')),
    flowDirection,
    layoutOptions,
  }
}

// TODO: Don't limit the fields here.
function createSchemaNodeHtml(node: SchemaGraphNode) {
  const fieldRows = node.fields
    .slice(0, 6)
    .map(
      ([name = '', type = '']) =>
        `<div style="font-size: 10px; color: ${SCHEMA_NODE_FIELD_COLOR.light};">${escapeHtml(name)} · ${escapeHtml(type)}</div>`,
    )
    .join('')

  return `
    <div style="font-family: sans-serif; padding: 12px;">
      <b style="color: ${SCHEMA_NODE_TITLE_COLOR.light};">${escapeHtml(node.name)}</b>
      <div style="font-size: 11px; margin-top: 3px; color: ${SCHEMA_NODE_SUBTITLE_COLOR.light};">${escapeHtml(node.appLabel)}.${escapeHtml(node.modelName)}</div>
      <div style="margin-top: 8px;">${fieldRows}</div>
    </div>
  `
}

export function createGroupLabelHtml(name: string) {
  return `
    <div style="font-family: sans-serif; padding: 8px 12px;">
      <b style="font-size: 11px; color: ${SCHEMA_NODE_SUBTITLE_COLOR.light};">${escapeHtml(name)}</b>
    </div>
  `
}

export function measureGroupLabelHeight(html: string, width: number): number {
  if (!html) return 0

  try {
    const result = layout({ html, width, accuracy: renderTagAccuracy })
    return result.height
  } catch {
    // render-tag requires DOMParser; fall back to a reasonable estimate
    // when running in non-browser environments (SSR, tests).
    return 30
  }
}

function getSchemaEdgeKind(edge: SchemaGraphEdge): CanvasEdgeKind {
  if (edge.isProxy) return 'proxy'
  if (edge.isSubclass) return 'subclass'
  if (edge.isManyToMany) return 'many-to-many'
  if (edge.isOneToOne) return 'one-to-one'
  if (edge.isForeignKey) return 'foreign-key'

  return 'relation'
}

/** Adapts backend schema graph payloads into initial canvas nodes and edges before any ELK layout is applied. */
export function createSchemaCanvasGraph(
  schemaGraph: SchemaGraphPayload,
): SchemaCanvasGraph {
  const groupNodes: Array<CanvasNode> = schemaGraph.groups.map((group) => {
    const groupWidth = CANVAS_NODE_SHAPES.group.defaultSize.width
    const html = createGroupLabelHtml(group.name)
    const contentHeight = measureGroupLabelHeight(html, groupWidth)

    return {
      id: `${SCHEMA_GROUP_PREFIX}${group.id}`,
      kind: 'group',
      shape: 'group',
      layoutMode: 'auto',
      x: 0,
      y: 0,
      width: groupWidth,
      height: CANVAS_NODE_SHAPES.group.defaultSize.height,
      lexicalJson: '',
      html,
      contentHeight,
      version: 1,
    }
  })

  const schemaNodes: Array<CanvasNode> = schemaGraph.nodes.map((node) => ({
    id: node.id,
    kind: 'editable',
    shape: 'box',
    layoutMode: 'auto',
    appLabel: node.appLabel,
    modelName: node.modelName,
    parentGroupId: `${SCHEMA_GROUP_PREFIX}${node.group}`,
    x: 0,
    y: 0,
    width: 260,
    height: 148,
    lexicalJson: '',
    html: createSchemaNodeHtml(node),
    contentHeight: 0,
    version: 1,
  }))

  return {
    nodes: [...groupNodes, ...schemaNodes],
    edges: schemaGraph.edges.map((edge, index) => ({
      id: [
        'schema-edge',
        edge.source,
        edge.target,
        edge.sourceField || index,
      ].join(':'),
      sourceNodeId: edge.source,
      targetNodeId: edge.target,
      kind: getSchemaEdgeKind(edge),
      label: edge.sourceField,
    })),
  }
}
