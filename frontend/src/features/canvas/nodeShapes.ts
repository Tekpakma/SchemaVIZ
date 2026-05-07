import type { CanvasNode, CanvasNodeShapeName } from './model/types'

export type CanvasNodeSize = {
  width: number
  height: number
}

export type CanvasNodeShapeDefinition = {
  name: CanvasNodeShapeName
  defaultSize: CanvasNodeSize
  minSize: CanvasNodeSize
  cornerRadius: number
}

export const CANVAS_NODE_SHAPES = {
  box: {
    name: 'box',
    defaultSize: {
      width: 220,
      height: 120,
    },
    minSize: {
      width: 120,
      height: 64,
    },
    cornerRadius: 8,
  },
} satisfies Record<CanvasNodeShapeName, CanvasNodeShapeDefinition>

export const DEFAULT_CANVAS_NODE_SHAPE_NAME: CanvasNodeShapeName = 'box'

export const DEFAULT_CANVAS_NODE_SHAPE =
  CANVAS_NODE_SHAPES[DEFAULT_CANVAS_NODE_SHAPE_NAME]

/**
 * Resolves rendering and sizing constraints for a canvas node from its shape.
 * Keep node behavior keyed through this registry so new shapes can define
 * their own defaults and minimum resize bounds in one place.
 */
export function getCanvasNodeShapeDefinition(
  node: CanvasNode,
): CanvasNodeShapeDefinition {
  return CANVAS_NODE_SHAPES[node.shape]
}
