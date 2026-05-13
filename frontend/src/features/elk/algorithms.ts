import type { LayoutOptions } from 'elkjs/lib/elk-api'

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
  },
  Tree: {
    'elk.algorithm': 'mrtree',
    'elk.direction': 'RIGHT',
    'elk.edgeRouting': 'ORTHOGONAL',
    'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
    'elk.padding': '[top=36,left=36,bottom=36,right=36]',
    'elk.spacing.nodeNode': '48',
  },
  Force: {
    'elk.algorithm': 'force',
    'elk.edgeRouting': 'SPLINES',
    'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
    'elk.padding': '[top=36,left=36,bottom=36,right=36]',
    'elk.spacing.nodeNode': '48',
  },
  Radial: {
    'elk.algorithm': 'radial',
    'elk.edgeRouting': 'SPLINES',
    'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
    'elk.padding': '[top=36,left=36,bottom=36,right=36]',
    'elk.spacing.nodeNode': '48',
  },
}
