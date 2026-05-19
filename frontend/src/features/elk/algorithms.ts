import type { LayoutOptions } from 'elkjs/lib/elk-api'
import type { CanvasFlowDirection } from '@/features/canvas/model/types'

export type LayoutAlgorithm = 'Layered' | 'Tree' | 'Force' | 'Radial'

export const ELK_ALGORITHMS: Record<LayoutAlgorithm, LayoutOptions> = {
  Layered: {
    'elk.algorithm': 'layered',
    'elk.direction': 'RIGHT',
    'elk.edgeRouting': 'ORTHOGONAL',
    'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
    'elk.padding': '[top=36,left=36,bottom=36,right=36]',
    'elk.spacing.nodeNode': '48',
    'elk.layered.spacing.nodeNodeBetweenLayers': '88',
    'elk.layered.spacing.edgeNodeBetweenLayers': '32',
    'elk.layered.spacing.edgeEdgeBetweenLayers': '16',
    'elk.edgeLabels.placement': 'CENTER',
    'elk.spacing.edgeLabel': '8',
  },
  Tree: {
    'elk.algorithm': 'mrtree',
    'elk.direction': 'RIGHT',
    'elk.edgeRouting': 'ORTHOGONAL',
    'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
    'elk.padding': '[top=36,left=36,bottom=36,right=36]',
    'elk.spacing.nodeNode': '48',
    'elk.edgeLabels.placement': 'CENTER',
    'elk.spacing.edgeLabel': '8',
  },
  Force: {
    'elk.algorithm': 'force',
    'elk.edgeRouting': 'SPLINES',
    'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
    'elk.padding': '[top=36,left=36,bottom=36,right=36]',
    'elk.spacing.nodeNode': '48',
    'elk.edgeLabels.placement': 'CENTER',
    'elk.spacing.edgeLabel': '8',
  },
  Radial: {
    'elk.algorithm': 'radial',
    'elk.edgeRouting': 'SPLINES',
    'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
    'elk.padding': '[top=36,left=36,bottom=36,right=36]',
    'elk.spacing.nodeNode': '48',
    'elk.edgeLabels.placement': 'CENTER',
    'elk.spacing.edgeLabel': '8',
  },
}

/**
 * Compact layered layout for the builder preview panel.
 * Tighter spacing than the full canvas, with INTERACTIVE layering
 * to preserve recipe order (left→right) even without inter-group edges.
 */
export const ELK_BUILDER_PREVIEW: LayoutOptions = {
  ...ELK_ALGORITHMS.Layered,
  'elk.layered.layering.strategy': 'INTERACTIVE',
  'elk.layered.crossingMinimization.forceNodeModelOrder': 'true',
  'elk.padding': '[top=32,left=16,bottom=16,right=16]',
  'elk.spacing.nodeNode': '20',
  'elk.layered.spacing.nodeNodeBetweenLayers': '48',
  'elk.layered.spacing.edgeNodeBetweenLayers': '24',
  'elk.layered.spacing.edgeEdgeBetweenLayers': '12',
}

const ELK_BUILDER_PREVIEW_COMMON: LayoutOptions = {
  'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
  'elk.padding': '[top=32,left=16,bottom=16,right=16]',
  'elk.spacing.nodeNode': '48',
  'elk.edgeLabels.placement': 'CENTER',
  'elk.spacing.edgeLabel': '8',
}

export function getBuilderPreviewLayoutOptions(
  algorithm: LayoutAlgorithm,
): LayoutOptions {
  if (algorithm === 'Layered') {
    return ELK_BUILDER_PREVIEW
  }

  return {
    ...ELK_ALGORITHMS[algorithm],
    ...ELK_BUILDER_PREVIEW_COMMON,
  }
}

export function getBuilderPreviewFlowDirection(direction: CanvasFlowDirection) {
  return direction
}
