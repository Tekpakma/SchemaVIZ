import { Stage, Layer, Rect } from 'react-konva'
import { RichTextNode, RichTextNodeText } from './RichTextNode'
import { SelectedNodeToolbar } from './SelectedNodeToolbar'
import { useCanvasActions, useCanvasNodeIds } from '@/store/canvasStore'
import { LexicalOverlayWrapper } from '@/features/lexical/LexicalOverlay'
import { useCanvasStageSize } from '../hooks/useCanvasStageSize'
import { useCanvasMarqueeSelection } from '../hooks/useCanvasMarqueeSelection'
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
  const {
    isSelecting,
    selectionRect,
    handleMarqueeMouseDown,
    handleMarqueeMouseMove,
    handleMarqueeMouseUp,
  } = useCanvasMarqueeSelection()

  useEnsureDefaultCanvasNode()

  const handleStagePointerDown = useCallback(
    (event: KonvaEventObject<MouseEvent>) => {
      if (handleMarqueeMouseDown(event)) return
      if (event.target !== event.currentTarget) return

      selectNode(null)
    },
    [handleMarqueeMouseDown, selectNode],
  )

  const handleStageTouchStart = useCallback(
    (event: KonvaEventObject<TouchEvent>) => {
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
        draggable={!isSelecting}
        onDragMove={handleStageDragMove}
        onDragEnd={handleStageDragMove}
        onWheel={handleWheel}
        onMouseDown={handleStagePointerDown}
        onMouseMove={handleMarqueeMouseMove}
        onMouseUp={handleMarqueeMouseUp}
        onTouchStart={handleStageTouchStart}
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
        <Layer listening={false}>
          {selectionRect && (
            <Rect
              x={selectionRect.x}
              y={selectionRect.y}
              width={selectionRect.width}
              height={selectionRect.height}
              fill="rgba(59, 130, 246, 0.10)"
              stroke="#3b82f6"
              strokeWidth={1}
              strokeScaleEnabled={false}
              listening={false}
            />
          )}
        </Layer>
      </Stage>
      <SelectedNodeToolbar />
      {<LexicalOverlayWrapper />}
    </div>
  )
}
