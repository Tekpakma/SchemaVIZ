import { Stage, Layer } from 'react-konva'
import { RichTextNode, RichTextNodeText } from './RichTextNode'
import { useCanvasActions, useCanvasNodeIds } from '@/store/canvasStore'
import { LexicalOverlayWrapper } from '@/features/lexical/LexicalOverlay'
import { useCanvasStageSize } from '../hooks/useCanvasStageSize'
import { useCanvasViewportControls } from '../hooks/useCanvasViewportControls'
import { useEnsureDefaultCanvasNode } from '../hooks/useEnsureDefaultCanvasNode'
import { useCallback } from 'react'
import type { KonvaEventObject } from 'konva/lib/Node'

export function MainScreen() {
  const { ref: stageContainerRef, size } = useCanvasStageSize()
  const nodeIds = useCanvasNodeIds()
  const { selectNode } = useCanvasActions()
  const { viewport, handleStageDragMove, handleWheel } =
    useCanvasViewportControls()

  useEnsureDefaultCanvasNode()

  const handleStagePointerDown = useCallback(
    (event: KonvaEventObject<MouseEvent | TouchEvent>) => {
      if (event.target !== event.currentTarget) return

      selectNode(null)
    },
    [selectNode],
  )

  return (
    <div
      ref={stageContainerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      <Stage
        width={size.width}
        height={size.height}
        x={viewport.x}
        y={viewport.y}
        scaleX={viewport.scale}
        scaleY={viewport.scale}
        draggable
        onDragMove={handleStageDragMove}
        onDragEnd={handleStageDragMove}
        onWheel={handleWheel}
        onMouseDown={handleStagePointerDown}
        onTouchStart={handleStagePointerDown}
      >
        <Layer>
          {nodeIds.map((id) => (
            <RichTextNode key={id} nodeId={id} />
          ))}
        </Layer>
        <Layer listening={false}>
          {nodeIds.map((id) => (
            <RichTextNodeText key={id} nodeId={id} />
          ))}
        </Layer>
      </Stage>
      {<LexicalOverlayWrapper />}
    </div>
  )
}
