import type { CanvasEdge, CanvasNode } from '@/features/canvas/model/types'
import type { RecipeData, RecipeStepKind } from './types'

/**
 * Keep accumulated path context visible while users move between recipe steps.
 */
export function shouldShowEdges(_stepKind: RecipeStepKind): boolean {
  return true
}

/**
 * Builder preview has one persistent computed layout mode. Step changes should
 * only alter controls/affordances, not switch graph layout strategy.
 */
export function shouldAutoLayout(_stepKind: RecipeStepKind): boolean {
  return true
}

export function getBuilderPreviewRelayoutSignature({
  edges,
  layoutAlgorithm,
  layoutDirection,
  nodes,
}: {
  edges: CanvasEdge[]
  layoutAlgorithm: RecipeData['layoutAlgorithm']
  layoutDirection: RecipeData['layoutDirection']
  nodes: CanvasNode[]
}) {
  return JSON.stringify({
    layoutAlgorithm,
    layoutDirection,
    nodes: nodes.map((node) => ({
      id: node.id,
      kind: node.kind,
      parentGroupId: node.parentGroupId ?? '',
      shape: node.shape,
      shapeKey: node.styleOverrides?.shapeKey ?? '',
      width: node.width,
      height: node.height,
      groupLayout:
        'groupLayout' in node ? JSON.stringify(node.groupLayout ?? null) : '',
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      sourceNodeId: edge.sourceNodeId,
      targetNodeId: edge.targetNodeId,
      kind: edge.kind,
      label: edge.label ?? '',
    })),
  })
}
