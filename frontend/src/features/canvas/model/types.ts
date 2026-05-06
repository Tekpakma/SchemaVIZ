export type NodeId = string

export type CanvasNode = {
  id: NodeId

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
  nodes: Record<NodeId, CanvasNode>
  selectedNodeId: NodeId | null
  editingNodeId: NodeId | null
}
