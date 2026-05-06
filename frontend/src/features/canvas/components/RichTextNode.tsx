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

type RichTextNodeProps = {
  nodeId: NodeId
}

type LayoutTreeNode =
  | LayoutResult['layoutRoot']
  | LayoutResult['layoutRoot']['children'][number]

function getTextBounds(layoutResult: LayoutResult) {
  let top = Number.POSITIVE_INFINITY
  let bottom = Number.NEGATIVE_INFINITY

  const visit = (layoutNode: LayoutTreeNode) => {
    if (layoutNode.type === 'text') {
      if (!layoutNode.text.trim()) return

      const lineHeight =
        layoutNode.style.lineHeight || layoutNode.style.fontSize * 1.2

      top = Math.min(top, layoutNode.y - lineHeight * 0.8)
      bottom = Math.max(bottom, layoutNode.y + lineHeight * 0.2)
      return
    }

    layoutNode.children.forEach(visit)
  }

  visit(layoutResult.layoutRoot)

  if (!Number.isFinite(top) || !Number.isFinite(bottom)) return null

  return {
    top,
    bottom,
  }
}

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
      <Rect
        width={node.width}
        height={node.height}
        fill={fill}
        cornerRadius={8}
        listening
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

  const textBounds = getTextBounds(layoutResult)
  const contentOffsetY = textBounds
    ? node.height / 2 - (textBounds.top + textBounds.bottom) / 2
    : 0

  return (
    <Group x={node.x} y={node.y + contentOffsetY} listening={false}>
      <Shape
        width={node.width}
        height={layoutResult.height}
        listening={false}
        sceneFunc={({ _context: ctx }) => {
          ctx.save()
          drawLayout({
            layout: layoutResult,
            ctx,
            width: node.width,
            pixelRatio: 1,
          })
          ctx.restore()
        }}
      />
    </Group>
  )
})
