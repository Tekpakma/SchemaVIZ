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
  CANVAS_NODE_BORDER_FALLBACKS,
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
  shapeKey?: string
}

type RichTextNodeContentProps = {
  x: number
  y: number
  width: number
  height: number
  layoutResult: LayoutResult
}

// ---------------------------------------------------------------------------
// Custom shape scene functions (Konva sceneFunc) for non-default shapes.
// These paint the same silhouettes as the backend shape_registry SVG, but
// using the Canvas 2D API so Konva can composite them with fill/stroke.
// ---------------------------------------------------------------------------

function drawCylinderScene(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
) {
  const ry = Math.min(h * 0.12, 16)
  const top = ry
  const bottom = h - ry

  // Body
  ctx.moveTo(0, top)
  ctx.lineTo(0, bottom)
  ctx.ellipse(w / 2, bottom, w / 2, ry, 0, Math.PI, 0, true)
  ctx.lineTo(w, top)
  ctx.ellipse(w / 2, top, w / 2, ry, 0, 0, Math.PI, true)
  ctx.closePath()
}

function drawCloudScene(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // Normalised cloud path scaled to (w, h)
  const sx = w / 120
  const sy = h / 55
  ctx.moveTo(0 * sx, 35 * sy)
  ctx.quadraticCurveTo(0 * sx, 15 * sy, 20 * sx, 15 * sy)
  ctx.quadraticCurveTo(20 * sx, 0 * sy, 40 * sx, 0 * sy)
  ctx.quadraticCurveTo(60 * sx, 0 * sy, 70 * sx, 10 * sy)
  ctx.quadraticCurveTo(90 * sx, 5 * sy, 100 * sx, 20 * sy)
  ctx.quadraticCurveTo(120 * sx, 20 * sy, 120 * sx, 40 * sy)
  ctx.quadraticCurveTo(120 * sx, 55 * sy, 100 * sx, 55 * sy)
  ctx.lineTo(20 * sx, 55 * sy)
  ctx.quadraticCurveTo(0 * sx, 55 * sy, 0 * sx, 35 * sy)
  ctx.closePath()
}

function drawServerScene(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const r = 4
  const pad = 4
  const bayH = (h - 2 * pad) / 3

  // Chassis (rounded rect)
  ctx.moveTo(pad + r, pad)
  ctx.arcTo(w - pad, pad, w - pad, h - pad, r)
  ctx.arcTo(w - pad, h - pad, pad, h - pad, r)
  ctx.arcTo(pad, h - pad, pad, pad, r)
  ctx.arcTo(pad, pad, w - pad, pad, r)
  ctx.closePath()

  // Bay dividers
  ctx.moveTo(pad, pad + bayH)
  ctx.lineTo(w - pad, pad + bayH)
  ctx.moveTo(pad, pad + 2 * bayH)
  ctx.lineTo(w - pad, pad + 2 * bayH)

  // LEDs
  for (let i = 0; i < 3; i++) {
    const cy = pad + bayH * i + bayH / 2
    const cx = pad + 12
    ctx.moveTo(cx + 3, cy)
    ctx.arc(cx, cy, 3, 0, Math.PI * 2)
  }
}

const RichTextNodeSurface = memo(function RichTextNodeSurface({
  width,
  height,
  fill,
  opacity,
  stroke,
  dash,
  cornerRadius,
  shapeKey,
}: RichTextNodeSurfaceProps) {
  const isCustomShape = shapeKey && shapeKey !== 'default' && shapeKey !== 'box'

  if (isCustomShape) {
    return (
      <Shape
        width={width}
        height={height}
        fill={fill}
        opacity={opacity}
        stroke={stroke}
        dash={dash}
        strokeScaleEnabled={false}
        perfectDrawEnabled={false}
        listening
        sceneFunc={(context, shape) => {
          const ctx = context._context
          ctx.beginPath()
          if (shapeKey === 'cylinder') {
            drawCylinderScene(ctx, shape.width(), shape.height())
          } else if (shapeKey === 'cloud') {
            drawCloudScene(ctx, shape.width(), shape.height())
          } else if (shapeKey === 'server') {
            drawServerScene(ctx, shape.width(), shape.height())
          } else {
            // Fallback: rounded rect
            const w = shape.width()
            const h = shape.height()
            const r = cornerRadius
            ctx.moveTo(r, 0)
            ctx.arcTo(w, 0, w, h, r)
            ctx.arcTo(w, h, 0, h, r)
            ctx.arcTo(0, h, 0, 0, r)
            ctx.arcTo(0, 0, w, 0, r)
            ctx.closePath()
          }
          context.fillStrokeShape(shape)
        }}
      />
    )
  }

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
      // Konva normally does an extra draw pass to perfectly composite
      // fill + stroke + opacity together. The visual difference for a
      // solid rounded rect is imperceptible; skipping the extra pass
      // is the recommended optimisation when you have many such shapes.
      // https://konvajs.org/docs/performance/Disable_Perfect_Draw.html
      perfectDrawEnabled={false}
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

  // NOTE: We deliberately do NOT call `group.cache()` here even though
  // Konva recommends it for complex sceneFuncs. The cache rasterises at
  // a fixed pixel ratio captured at cache time; any later zoom-in
  // upscales the bitmap and the text turns blurry. The only ways to
  // avoid that are (a) re-cache on every zoom (expensive), or (b) cache
  // at a high enough pixelRatio to cover all zoom levels — which at
  // 5000 nodes × retina × ~3× zoom headroom would be ~1 GB of canvas
  // memory. Keeping `drawLayout` live trades CPU per redraw for crisp
  // text at every zoom level. Other Konva tips (perfectDrawEnabled,
  // layer count, listening, render-tag layout cache, conditional
  // reconcile) carry the perf load instead.

  if (width <= 0 || layoutResult.height <= 0) return null

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
  // No `.cache()` — see explanation on RichTextNodeContent above.

  if (width <= 0 || layoutResult.height <= 0) return null

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

  const themeFill = useMemo(
    () =>
      resolveCanvasThemeColor({
        fallback: CANVAS_SURFACE_FALLBACKS[resolvedTheme],
        variableName: CANVAS_NODE_SURFACE_VARIABLE,
      }),
    [resolvedTheme],
  )
  const themeSurfaceStroke = CANVAS_NODE_BORDER_FALLBACKS[resolvedTheme]

  // Per-node style overrides from typeSpecificData (shape, border, background)
  const fill = node?.styleOverrides?.backgroundColor || themeFill
  const surfaceStroke = node?.styleOverrides?.borderColor || themeSurfaceStroke

  const shapeDefinition = node ? getCanvasNodeShapeDefinition(node) : null

  const handleStartEditing = useCallback(
    (event?: KonvaEventObject<MouseEvent | TouchEvent>) => {
      if (readOnly) return
      if (event) {
        event.cancelBubble = true
      }
      startEditing(nodeId)
    },
    [nodeId, readOnly, startEditing],
  )

  if (!node || !shapeDefinition || editingNodeId === node.id) return null

  const isGroup = node.kind === 'group'
  // Group children are positioned by ELK (rectpacking / layered / ...).
  // Manual drag inside a group is deferred to a future per-child override
  // layer; today only top-level nodes are drag-positionable.
  const canDragNode = !readOnly && !node.parentGroupId

  const selectThisNode = (event: KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (readOnly) return

    if ('detail' in event.evt && event.evt.detail >= 2) {
      handleStartEditing(event)
      return
    }

    selectNode(node.id)
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
      draggable={canDragNode}
      onClick={selectThisNode}
      onTap={selectThisNode}
      onMouseDown={selectThisNode}
      onDblClick={handleStartEditing}
      onDblTap={handleStartEditing}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
    >
      <RichTextNodeSurface
        width={node.width}
        height={node.height}
        fill={fill}
        opacity={isGroup ? 0.16 : undefined}
        stroke={isGroup ? CANVAS_SELECT_COLOR : surfaceStroke}
        dash={isGroup ? [8, 4] : undefined}
        cornerRadius={shapeDefinition.cornerRadius}
        shapeKey={node.styleOverrides?.shapeKey}
      />
      {isSelected && (
        <Rect
          width={node.width}
          height={node.height}
          cornerRadius={shapeDefinition.cornerRadius}
          stroke={CANVAS_SELECT_COLOR}
          strokeWidth={1.5}
          strokeScaleEnabled={false}
          perfectDrawEnabled={false}
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
  const { startEditing, updateNodeFrame } = useCanvasActions()
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

  const handleDoubleClick = useCallback(
    (event: KonvaEventObject<MouseEvent | TouchEvent>) => {
      if (!node) return
      event.cancelBubble = true
      startEditing(node.id)
    },
    [node, startEditing],
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
        onDblClick={handleDoubleClick}
        onDblTap={handleDoubleClick}
        onTransformEnd={handleTransformEnd}
      >
        <Rect width={node.width} height={node.height} listening={false} />
      </Group>
      <Transformer
        ref={transformerRef}
        onDblClick={handleDoubleClick}
        onDblTap={handleDoubleClick}
        {...transformerProps}
      />
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
