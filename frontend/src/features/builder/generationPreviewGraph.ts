/**
 * Converts a generation-run result (live data) into a canvas graph that
 * the builder preview can render. Group nodes become ELK compound groups;
 * regular nodes become generation-kind boxes; edges map directly.
 */

import type { CanvasEdge, CanvasNode } from '@/features/canvas/model/types'
import type { GenerationRunResult } from './generationPreviewQuery'
import {
  builderPreviewGroupLabelHtml,
  builderPreviewNodeHtml,
} from './builderPreviewHtml'
import {
  BUILDER_PREVIEW_GROUP_MIN_HEIGHT,
  BUILDER_PREVIEW_GROUP_MIN_WIDTH,
  BUILDER_PREVIEW_NODE_HEIGHT,
  BUILDER_PREVIEW_NODE_WIDTH,
} from './builderPreviewLayout'

const GENERATION_GROUP_LABEL_HEIGHT = 28
const LAYER_GROUP_X_HINT_SPACING = 300

export type GenerationPreviewCanvasGraph = {
  edges: CanvasEdge[]
  key: string
  nodes: CanvasNode[]
}

export function getGenerationPreviewCanvasGraph(
  result: GenerationRunResult,
): GenerationPreviewCanvasGraph {
  const groupNodes: CanvasNode[] = []
  const modelNodes: CanvasNode[] = []
  const nodes = result.nodes ?? []
  const resultEdges = result.edges ?? []

  // Track group ordering for INTERACTIVE layering hints
  let groupIndex = 0
  const groupXByNodeId = new Map<string, number>()

  for (const node of nodes) {
    if (node.isGroup) {
      const x = groupIndex * LAYER_GROUP_X_HINT_SPACING
      groupXByNodeId.set(node.id, x)
      groupIndex++

      groupNodes.push({
        id: node.id,
        kind: 'group',
        shape: 'group',
        layoutMode: 'auto',
        x,
        y: 0,
        width: BUILDER_PREVIEW_GROUP_MIN_WIDTH,
        height: BUILDER_PREVIEW_GROUP_MIN_HEIGHT,
        lexicalJson: '',
        html: builderPreviewGroupLabelHtml(node.displayName || node.label || ''),
        contentHeight: GENERATION_GROUP_LABEL_HEIGHT,
        version: 1,
      })
    } else {
      modelNodes.push({
        id: node.id,
        kind: 'generation',
        shape: 'box',
        layoutMode: 'auto',
        ...(node.parentId ? { parentGroupId: node.parentId } : {}),
        x: 0,
        y: 0,
        width: BUILDER_PREVIEW_NODE_WIDTH,
        height: BUILDER_PREVIEW_NODE_HEIGHT,
        lexicalJson: '',
        html: builderPreviewNodeHtml(
          node.displayName,
          `${node.appLabel}.${node.modelName}`,
        ),
        contentHeight: 0,
        version: 1,
      })
    }
  }

  const edges: CanvasEdge[] = resultEdges.map((edge, index) => ({
    id: `gen-edge-${index}-${edge.source}-${edge.target}`,
    sourceNodeId: edge.source,
    targetNodeId: edge.target,
    kind: 'default',
    label: edge.relationship || undefined,
  }))

  const allNodes = [...groupNodes, ...modelNodes]

  // Build a stable key for canvas remounting
  const keyParts = [
    'gen-preview-v1',
    ...nodes.map((n) => `${n.id}:${n.displayName}`),
    ...resultEdges.map((e) => `${e.source}-${e.target}`),
  ]
  const key = keyParts.join('|')

  return { edges, key, nodes: allNodes }
}
