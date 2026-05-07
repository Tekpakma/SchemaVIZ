export type NodeId = string

export type CanvasNodeShapeName = 'box' | 'group'

export type CanvasNode<
  TShape extends CanvasNodeShapeName = CanvasNodeShapeName,
> = {
  id: NodeId
  shape: TShape
  parentGroupId?: NodeId

  x: number
  y: number
  width: number
  height: number

  lexicalJson: string
  html: string

  contentHeight: number
  version: number
}

export type CanvasState = {
  nodesById: Record<NodeId, CanvasNode>
  nodeOrder: Array<NodeId>
  childIdsByGroupId: Record<NodeId, Array<NodeId>>
  selectedNodeId: NodeId | null
  selectedNodeIds: Array<NodeId>
  isMarqueeSelecting: boolean
  editingNodeId: NodeId | null
}
