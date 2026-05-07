import { Group, Rect, Shape, Transformer } from 'react-konva'
import {
  useCanvasActions,
  useCanvasEditingNodeId,
  useCanvasNode,
  useSelectedNodeId,
  useSelectedNodeIds,
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
import { memo, useCallback, useMemo } from 'react'
import type { KonvaEventObject } from 'konva/lib/Node'
import { getCanvasNodeShapeDefinition } from '../nodeShapes'
import { getRenderTagTextBounds } from '@/features/rendering/renderTagTextBounds'
import { useNodeResizeTransformer } from '../hooks/useNodeResizeTransformer'
import type { NodeResizeFrame } from '../hooks/useNodeResizeTransformer'

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
  const selectedNodeId = useSelectedNodeId()
  const selectedNodeIds = useSelectedNodeIds()
  const { startEditing, selectNode, moveNode, updateNodeFrame } =
    useCanvasActions()
  const { resolvedTheme } = useTheme()
  const isSelected = selectedNodeIds.includes(nodeId)
  const isSingleSelected = isSelected && selectedNodeId === nodeId

  const fill = useMemo(
    () =>
      resolveCanvasThemeColor({
        fallback: CANVAS_SURFACE_FALLBACKS[resolvedTheme],
        variableName: CANVAS_NODE_SURFACE_VARIABLE,
      }),
    [resolvedTheme],
  )

  const shapeDefinition = node ? getCanvasNodeShapeDefinition(node) : null

  const handleResizeEnd = useCallback(
    ({ x, y, width, height }: NodeResizeFrame) => {
      if (!node) return

      updateNodeFrame({
        id: node.id,
        x,
        y,
        width,
        height,
      })
    },
    [node, updateNodeFrame],
  )

  const {
    nodeRef,
    transformerRef,
    handleTransformEnd,
    transformerProps,
  } = useNodeResizeTransformer({
    isEnabled: Boolean(node && shapeDefinition && isSingleSelected),
    frame: {
      x: node?.x ?? 0,
      y: node?.y ?? 0,
      width: node?.width ?? 0,
      height: node?.height ?? 0,
    },
    minSize: shapeDefinition?.minSize ?? {
      width: 0,
      height: 0,
    },
    onResizeEnd: handleResizeEnd,
  })

  if (!node || !shapeDefinition || editingNodeId === node.id) return null

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
    <>
      <Group
        ref={nodeRef}
        x={node.x}
        y={node.y}
        draggable
        onClick={handleClick}
        onTap={handleClick}
        onDblClick={handleDoubleClick}
        onDblTap={handleDoubleClick}
        onDragMove={handleDragMove}
        onDragEnd={handleDragMove}
        onTransformEnd={handleTransformEnd}
      >
        <RichTextNodeSurface
          width={node.width}
          height={node.height}
          fill={fill}
          cornerRadius={shapeDefinition.cornerRadius}
        />
        {isSelected && (
          <Rect
            width={node.width}
            height={node.height}
            cornerRadius={shapeDefinition.cornerRadius}
            stroke="#3b82f6"
            strokeWidth={1.5}
            strokeScaleEnabled={false}
            listening={false}
          />
        )}
      </Group>

      {isSingleSelected && (
        <Transformer
          ref={transformerRef}
          {...transformerProps}
        />
      )}
    </>
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
