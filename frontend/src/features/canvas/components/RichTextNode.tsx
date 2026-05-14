import { Group, Rect, Shape, Transformer } from 'react-konva'
import {
  useCanvasActions,
  useCanvasEditingNodeId,
  useCanvasNode,
  useSelectedNodeId,
  useSelectedNodeIds,
  useShowResolvedReferences,
} from '@/store/canvasStore'
import { getRenderTagLayout } from '@/features/rendering/renderTagCache'
import {
  CANVAS_NODE_SURFACE_VARIABLE,
  CANVAS_SELECT_COLOR,
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
import { useCanvasHelperLines } from '../hooks/useCanvasHelperLines'

type RichTextNodeProps = {
  nodeId: NodeId
  onDragEnd?: () => void
  readOnly?: boolean
}

type RichTextNodeSurfaceProps = {
  width: number
  height: number
  fill: string
  opacity?: number
  stroke?: string
  dash?: Array<number>
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
  opacity,
  stroke,
  dash,
  cornerRadius,
}: RichTextNodeSurfaceProps) {
  return (
    <Rect
      width={width}
      height={height}
      fill={fill}
      opacity={opacity}
      stroke={stroke}
      dash={dash}
      strokeScaleEnabled={false}
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
        sceneFunc={(context) => {
          const ctx = context._context
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

type RichTextNodeGroupLabelProps = {
  x: number
  y: number
  width: number
  layoutResult: LayoutResult
}

const RichTextNodeGroupLabel = memo(function RichTextNodeGroupLabel({
  x,
  y,
  width,
  layoutResult,
}: RichTextNodeGroupLabelProps) {
  return (
    <Group x={x} y={y} listening={false}>
      <Shape
        width={width}
        height={layoutResult.height}
        listening={false}
        sceneFunc={(context) => {
          const ctx = context._context
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
  onDragEnd,
  readOnly = false,
}: RichTextNodeProps) {
  const node = useCanvasNode(nodeId)
  const editingNodeId = useCanvasEditingNodeId()
  const selectedNodeIds = useSelectedNodeIds()
  const { startEditing, selectNode, moveNode } = useCanvasActions()
  const { snapFrame } = useCanvasHelperLines()
  const { resolvedTheme } = useTheme()
  const isSelected = selectedNodeIds.includes(nodeId)

  const fill = useMemo(
    () =>
      resolveCanvasThemeColor({
        fallback: CANVAS_SURFACE_FALLBACKS[resolvedTheme],
        variableName: CANVAS_NODE_SURFACE_VARIABLE,
      }),
    [resolvedTheme],
  )

  const shapeDefinition = node ? getCanvasNodeShapeDefinition(node) : null

  if (!node || !shapeDefinition || editingNodeId === node.id) return null

  const isGroup = node.kind === 'group'

  const selectThisNode = () => {
    if (readOnly) return
    selectNode(node.id)
  }

  const handleDoubleClick = () => {
    if (readOnly) return
    startEditing(node.id)
  }

  const handleDragMove = (event: KonvaEventObject<DragEvent>) => {
    if (readOnly) return
    const target = event.target
    const snappedPosition = snapFrame(
      {
        id: node.id,
        x: target.x(),
        y: target.y(),
        width: node.width,
        height: node.height,
      },
      {
        excludeNodeIds: [node.id],
      },
    )

    target.position(snappedPosition)
    moveNode({
      id: node.id,
      x: snappedPosition.x,
      y: snappedPosition.y,
    })
  }

  const handleDragEnd = (event: KonvaEventObject<DragEvent>) => {
    if (readOnly) return
    handleDragMove(event)
    onDragEnd?.()
  }

  return (
    <Group
      x={node.x}
      y={node.y}
      draggable={!readOnly && !node.parentGroupId}
      onClick={selectThisNode}
      onTap={selectThisNode}
      onDblClick={handleDoubleClick}
      onDblTap={handleDoubleClick}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
    >
      <RichTextNodeSurface
        width={node.width}
        height={node.height}
        fill={fill}
        opacity={isGroup ? 0.16 : undefined}
        stroke={isGroup ? CANVAS_SELECT_COLOR : undefined}
        dash={isGroup ? [6, 4] : undefined}
        cornerRadius={shapeDefinition.cornerRadius}
      />
      {isSelected && (
        <Rect
          width={node.width}
          height={node.height}
          cornerRadius={shapeDefinition.cornerRadius}
          stroke={CANVAS_SELECT_COLOR}
          strokeWidth={1.5}
          strokeScaleEnabled={false}
          listening={false}
        />
      )}
    </Group>
  )
})

export const RichTextNodeControls = memo(function RichTextNodeControls({
  nodeId,
}: RichTextNodeProps) {
  const node = useCanvasNode(nodeId)
  const editingNodeId = useCanvasEditingNodeId()
  const selectedNodeId = useSelectedNodeId()
  const selectedNodeIds = useSelectedNodeIds()
  const { updateNodeFrame } = useCanvasActions()
  const isSelected = selectedNodeIds.includes(nodeId)
  const isSingleSelected = isSelected && selectedNodeId === nodeId
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

  const { nodeRef, transformerRef, handleTransformEnd, transformerProps } =
    useNodeResizeTransformer({
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

  if (
    !node ||
    !shapeDefinition ||
    !isSingleSelected ||
    editingNodeId === node.id
  ) {
    return null
  }

  return (
    <>
      <Group
        ref={nodeRef}
        x={node.x}
        y={node.y}
        onTransformEnd={handleTransformEnd}
      >
        <Rect width={node.width} height={node.height} listening={false} />
      </Group>
      <Transformer ref={transformerRef} {...transformerProps} />
    </>
  )
})

export const RichTextNodeText = memo(function RichTextNodeText({
  nodeId,
}: RichTextNodeProps) {
  const node = useCanvasNode(nodeId)
  const editingNodeId = useCanvasEditingNodeId()
  const showResolved = useShowResolvedReferences()
  const { resolvedTheme } = useTheme()

  const layoutResult = useMemo(() => {
    if (!node) return null
    return getRenderTagLayout(node, showResolved, resolvedTheme)
  }, [node, showResolved, resolvedTheme])

  if (!node || !layoutResult || editingNodeId === node.id) {
    return null
  }

  // Groups render label top-aligned; regular nodes center vertically
  if (node.kind === 'group') {
    if (!node.html) return null

    return (
      <RichTextNodeGroupLabel
        x={node.x}
        y={node.y}
        width={node.width}
        layoutResult={layoutResult}
      />
    )
  }

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
