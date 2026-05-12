export type NodeId = string
export type EdgeId = string

export type CanvasNodeShapeName = 'box' | 'group'

export type CanvasPoint = {
  x: number
  y: number
}

export type CanvasNodeLayoutMode = 'auto' | 'manual'

export type CanvasRoutingAuthorityMode = 'auto' | 'manual'

type CanvasNodeBase<TShape extends CanvasNodeShapeName> = {
  id: NodeId
  shape: TShape
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

export type CanvasBoxNode = CanvasNodeBase<'box'> & {
  appLabel: string
  modelName: string
  recordId?: string
}

export type CanvasGroupNode = CanvasNodeBase<'group'>

export type CanvasNode<
  TShape extends CanvasNodeShapeName = CanvasNodeShapeName,
> = TShape extends 'box'
  ? CanvasBoxNode
  : TShape extends 'group'
    ? CanvasGroupNode
    : never

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
