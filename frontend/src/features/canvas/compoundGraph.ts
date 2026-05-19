import type { CanvasEdge, NodeId } from './model/types'

type ParentLookupNode = {
  id: NodeId
  parentGroupId?: NodeId
}

export function getParentNodeIdByNodeId(nodes: Iterable<ParentLookupNode>) {
  const parentNodeIdByNodeId = new Map<NodeId, NodeId>()

  for (const node of nodes) {
    if (node.parentGroupId) {
      parentNodeIdByNodeId.set(node.id, node.parentGroupId)
    }
  }

  return parentNodeIdByNodeId
}

export function isAncestorNode(
  ancestorNodeId: NodeId,
  nodeId: NodeId,
  parentNodeIdByNodeId: Map<NodeId, NodeId>,
) {
  let currentNodeId: NodeId | undefined = nodeId
  const visited = new Set<NodeId>()

  while (currentNodeId && !visited.has(currentNodeId)) {
    visited.add(currentNodeId)
    const parentNodeId = parentNodeIdByNodeId.get(currentNodeId)
    if (!parentNodeId) return false
    if (parentNodeId === ancestorNodeId) return true
    currentNodeId = parentNodeId
  }

  return false
}

export function isContainmentEdge(
  edge: Pick<CanvasEdge, 'sourceNodeId' | 'targetNodeId'>,
  parentNodeIdByNodeId: Map<NodeId, NodeId>,
) {
  if (edge.sourceNodeId === edge.targetNodeId) return true

  return (
    isAncestorNode(
      edge.sourceNodeId,
      edge.targetNodeId,
      parentNodeIdByNodeId,
    ) ||
    isAncestorNode(edge.targetNodeId, edge.sourceNodeId, parentNodeIdByNodeId)
  )
}

export function isRenderableCanvasEdge(
  edge: Pick<CanvasEdge, 'sourceNodeId' | 'targetNodeId'>,
  parentNodeIdByNodeId: Map<NodeId, NodeId>,
) {
  return !isContainmentEdge(edge, parentNodeIdByNodeId)
}
