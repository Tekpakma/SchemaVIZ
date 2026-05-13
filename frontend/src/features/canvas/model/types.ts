export type NodeId = string
export type EdgeId = string

// ---------------------------------------------------------------------------
// Node kind — behavioral category (determines editing, layout, interactions)
// ---------------------------------------------------------------------------

export type CanvasNodeKind =
  | 'editable'
  | 'group'
  | 'database'
  | 'placeholder'
  | 'generation'

// ---------------------------------------------------------------------------
// Visual shape — rendering form (corner radius, outline, silhouette)
// ---------------------------------------------------------------------------

export type CanvasNodeShapeName = 'box' | 'group'

// ---------------------------------------------------------------------------
// Geometry / layout primitives
// ---------------------------------------------------------------------------

export type CanvasPoint = {
  x: number
  y: number
}

export type CanvasNodeLayoutMode = 'auto' | 'manual'

export type CanvasRoutingAuthorityMode = 'auto' | 'manual'

// ---------------------------------------------------------------------------
// Node types — discriminated on `kind`
// ---------------------------------------------------------------------------

type CanvasNodeBase = {
  id: NodeId
  kind: CanvasNodeKind
  /** Visual shape — drives corner radius, outline style, silhouette. */
  shape: CanvasNodeShapeName
  parentGroupId?: NodeId
  layoutMode: CanvasNodeLayoutMode

  x: number
  y: number
  width: number
  height: number

  lexicalJson: string
  html: string

  contentHeight: number
  version: number
}

/** User-editable rich-text node. Can take any visual shape. */
export type CanvasEditableNode = CanvasNodeBase & {
  kind: 'editable'
  appLabel: string
  modelName: string
  recordId?: string
}

/** Container that clusters child nodes. */
export type CanvasGroupNode = CanvasNodeBase & {
  kind: 'group'
  shape: 'group'
}

/** Read-only schema model display. */
export type CanvasDatabaseNode = CanvasNodeBase & {
  kind: 'database'
  appLabel: string
  modelName: string
}

/** Preview carousel of relational children. */
export type CanvasPlaceholderNode = CanvasNodeBase & {
  kind: 'placeholder'
  appLabel: string
  modelName: string
  sourceNodeId: NodeId
}

/** Guided generation wizard step. */
export type CanvasGenerationNode = CanvasNodeBase & {
  kind: 'generation'
}

export type CanvasNode =
  | CanvasEditableNode
  | CanvasGroupNode
  | CanvasDatabaseNode
  | CanvasPlaceholderNode
  | CanvasGenerationNode

// ---------------------------------------------------------------------------
// Node kind capability helpers
// ---------------------------------------------------------------------------

/** Kinds whose content is user-editable via the Lexical overlay. */
export function isEditableNodeKind(kind: CanvasNodeKind): boolean {
  return kind === 'editable' || kind === 'group'
}

/** Kinds that can contain child nodes. */
export function isContainerNodeKind(kind: CanvasNodeKind): boolean {
  return kind === 'group'
}

/** Kinds that carry a data scope (appLabel / modelName). */
export function hasDataScope(
  node: CanvasNode,
): node is CanvasEditableNode | CanvasDatabaseNode | CanvasPlaceholderNode {
  return node.kind === 'editable' || node.kind === 'database' || node.kind === 'placeholder'
}

// ---------------------------------------------------------------------------
// Edges
// ---------------------------------------------------------------------------

export type CanvasEdgeKind =
  | 'default'
  | 'foreign-key'
  | 'many-to-many'
  | 'one-to-one'
  | 'proxy'
  | 'relation'
  | 'subclass'

export type CanvasPortSide = 'LEFT' | 'RIGHT' | 'TOP' | 'BOTTOM'

export type CanvasFlowDirection = 'LR' | 'RL' | 'TB' | 'BT'

export type CanvasPortRef = {
  side?: CanvasPortSide
  slot?: number
  slotCount?: number
}

export type CanvasEdge = {
  id: EdgeId
  sourceNodeId: NodeId
  targetNodeId: NodeId
  kind: CanvasEdgeKind
  sourcePort?: CanvasPortRef
  targetPort?: CanvasPortRef
  label?: string
  routePoints?: Array<CanvasPoint>
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export type CanvasNodeFrame = {
  id: NodeId
  x: number
  y: number
  width: number
  height: number
}

export type CanvasEdgeRoute = {
  id: EdgeId
  points: Array<CanvasPoint>
}

export type CanvasGraphLayoutResult = {
  nodeFrames: Array<CanvasNodeFrame>
  edgeRoutes: Array<CanvasEdgeRoute>
}

// ---------------------------------------------------------------------------
// Canvas state
// ---------------------------------------------------------------------------

export type CanvasState = {
  nodesById: Record<NodeId, CanvasNode>
  nodeOrder: Array<NodeId>
  edgesById: Record<EdgeId, CanvasEdge>
  edgeOrder: Array<EdgeId>
  childIdsByGroupId: Record<NodeId, Array<NodeId>>
  selectedNodeId: NodeId | null
  selectedNodeIds: Array<NodeId>
  isMarqueeSelecting: boolean
  editingNodeId: NodeId | null
}
