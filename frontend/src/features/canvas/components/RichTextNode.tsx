import { Group, Rect, Shape } from 'react-konva'
import {
  useCanvasActions,
  useCanvasEditingNodeId,
  useCanvasNode,
} from '@/store/canvasStore'
import { getRenderTagLayout } from '@/features/rendering/renderTagCache'
import {
  CANVAS_NODE_SURFACE_VARIABLE,
  CANVAS_SURFACE_FALLBACKS,
  resolveCanvasThemeColor,
} from '@/features/canvas/themeColors'
import { useTheme } from '@/features/theme/useTheme'
import { drawLayout } from 'render-tag'
import type { LayoutResult } from 'render-tag'
import type { NodeId } from '@/features/canvas/model/types'
import { memo, useMemo } from 'react'
import type { KonvaEventObject } from 'konva/lib/Node'
import { getCanvasNodeShapeDefinition } from '../nodeShapes'
import { getRenderTagTextBounds } from '@/features/rendering/renderTagTextBounds'

type RichTextNodeProps = {
  nodeId: NodeId
}

type RichTextNodeSurfaceProps = {
  width: number
  height: number
  fill: string
  cornerRadius: number
}

type RichTextNodeContentProps = {
  x: number
  y: number
  width: number
  height: number
  layoutResult: LayoutResult
}

const RichTextNodeSurface = memo(function RichTextNodeSurface({
  width,
  height,
  fill,
  cornerRadius,
}: RichTextNodeSurfaceProps) {
  return (
    <Rect
      width={width}
      height={height}
      fill={fill}
      cornerRadius={cornerRadius}
      listening
    />
  )
})

const RichTextNodeContent = memo(function RichTextNodeContent({
  x,
  y,
  width,
  height,
  layoutResult,
}: RichTextNodeContentProps) {
  const textBounds = getRenderTagTextBounds(layoutResult)
  const contentOffsetY = textBounds
    ? height / 2 - (textBounds.top + textBounds.bottom) / 2
    : 0

  return (
    <Group x={x} y={y + contentOffsetY} listening={false}>
      <Shape
        width={width}
        height={layoutResult.height}
        listening={false}
        sceneFunc={({ _context: ctx }) => {
          ctx.save()
          drawLayout({
            layout: layoutResult,
            ctx,
            width,
            pixelRatio: 1,
          })
          ctx.restore()
        }}
      />
    </Group>
  )
})

export const RichTextNode = memo(function RichTextNode({
  nodeId,
}: RichTextNodeProps) {
  const node = useCanvasNode(nodeId)
  const editingNodeId = useCanvasEditingNodeId()
  const { startEditing, selectNode, moveNode } = useCanvasActions()
  const { resolvedTheme } = useTheme()

  const fill = useMemo(
    () =>
      resolveCanvasThemeColor({
        fallback: CANVAS_SURFACE_FALLBACKS[resolvedTheme],
        variableName: CANVAS_NODE_SURFACE_VARIABLE,
      }),
    [resolvedTheme],
  )

  if (!node || editingNodeId === node.id) return null

  const shapeDefinition = getCanvasNodeShapeDefinition(node)

  const handleClick = () => {
    selectNode(node.id)
  }

  const handleDoubleClick = () => {
    startEditing(node.id)
  }

  const handleDragMove = (event: KonvaEventObject<DragEvent>) => {
    const target = event.target
    moveNode({
      id: node.id,
      x: target.x(),
      y: target.y(),
    })
  }
  return (
    <Group
      x={node.x}
      y={node.y}
      draggable
      onClick={handleClick}
      onTap={handleClick}
      onDblClick={handleDoubleClick}
      onDblTap={handleDoubleClick}
      onDragMove={handleDragMove}
      onDragEnd={handleDragMove}
    >
      <RichTextNodeSurface
        width={node.width}
        height={node.height}
        fill={fill}
        cornerRadius={shapeDefinition.cornerRadius}
      />
    </Group>
  )
})

export const RichTextNodeText = memo(function RichTextNodeText({
  nodeId,
}: RichTextNodeProps) {
  const node = useCanvasNode(nodeId)
  const editingNodeId = useCanvasEditingNodeId()

  const layoutResult = useMemo(() => {
    if (!node) return null
    return getRenderTagLayout(node)
  }, [node])

  if (!node || !layoutResult || editingNodeId === node.id) return null

  return (
    <RichTextNodeContent
      x={node.x}
      y={node.y}
      width={node.width}
      height={node.height}
      layoutResult={layoutResult}
    />
  )
})
