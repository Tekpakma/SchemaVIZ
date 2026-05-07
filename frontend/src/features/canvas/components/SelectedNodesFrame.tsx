import { Group, Rect } from 'react-konva'
import { useRef } from 'react'
import type { KonvaEventObject } from 'konva/lib/Node'
import { useCanvasActions, useIsMarqueeSelecting } from '@/store/canvasStore'
import { useSelectedNodeBounds } from '../hooks/useSelectedNodeBounds'

type DragPosition = {
  x: number
  y: number
}

export function SelectedNodesFrame() {
  const bounds = useSelectedNodeBounds()
  const isMarqueeSelecting = useIsMarqueeSelecting()
  const { moveSelectedNodes } = useCanvasActions()
  const lastDragPositionRef = useRef<DragPosition | null>(null)

  if (isMarqueeSelecting || !bounds || bounds.selectedCount < 2) return null

  const handleDragStart = (event: KonvaEventObject<DragEvent>) => {
    lastDragPositionRef.current = {
      x: event.target.x(),
      y: event.target.y(),
    }
  }

  const handleDragMove = (event: KonvaEventObject<DragEvent>) => {
    const lastPosition = lastDragPositionRef.current
    if (!lastPosition) return

    const nextPosition = {
      x: event.target.x(),
      y: event.target.y(),
    }

    moveSelectedNodes({
      deltaX: nextPosition.x - lastPosition.x,
      deltaY: nextPosition.y - lastPosition.y,
    })
    lastDragPositionRef.current = nextPosition
  }

  const handleDragEnd = (event: KonvaEventObject<DragEvent>) => {
    handleDragMove(event)
    lastDragPositionRef.current = null
  }

  return (
    <Group
      x={bounds.x}
      y={bounds.y}
      draggable
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
    >
      <Rect
        width={bounds.width}
        height={bounds.height}
        fill="rgba(59, 130, 246, 0.04)"
        stroke="#3b82f6"
        strokeWidth={1}
        dash={[3, 3]}
        strokeScaleEnabled={false}
      />
    </Group>
  )
}
