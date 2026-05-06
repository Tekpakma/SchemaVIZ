import { Group, Rect, Shape } from 'react-konva'
import { useCanvasActions, useCanvasNode, useSelectedNodeId } from '@/store/canvasStore'
import { getRenderTagLayout } from '@/features/rendering/renderTagCache'
import { drawLayout } from 'render-tag';
import type { NodeId } from '@/features/canvas/model/types';
import { memo, useMemo } from 'react';
import type { KonvaEventObject } from 'konva/lib/Node'

type RichTextNodeProps = {
  nodeId: NodeId
}

export const RichTextNode = memo(function RichTextNode({
  nodeId,
}: RichTextNodeProps) {
  const node = useCanvasNode(nodeId)
  const selectedNodeId = useSelectedNodeId()
  const { startEditing, selectNode, moveNode } = useCanvasActions()

  const isSelected = selectedNodeId === nodeId

  const layoutResult = useMemo(() => {
    if (!node) return null
    return getRenderTagLayout(node)
  }, [node])

  if (!node || !layoutResult) return null

  const handleClick = () => {
    selectNode(node.id)
  }

  const handleDoubleClick = () => {
    startEditing(node.id)
  }

  const handleDragEnd = (event: KonvaEventObject<DragEvent>) => {
    const target = event.target

    moveNode(node.id, target.x(), target.y())
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
      onDragEnd={handleDragEnd}
    >
      <Rect
        width={node.width}
        height={node.height}
        fill="white"
        stroke={isSelected ? '#2563eb' : '#d1d5db'}
        strokeWidth={isSelected ? 2 : 1}
        cornerRadius={8}
        shadowBlur={5}
        shadowOpacity={0.18}
        listening
      />

      <Group clipWidth={node.width} clipHeight={node.height}>
        <Shape
          width={node.width}
          height={node.height}
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
    </Group>
  )
})
