import { Stage, Layer } from 'react-konva'
import { RichTextNode, RichTextNodeText } from './RichTextNode'
import { useCanvasNodeIds } from '@/store/canvasStore'
import { LexicalOverlayWrapper } from '@/features/lexical/LexicalOverlay'
import { useCanvasStageSize } from '../hooks/useCanvasStageSize'
import { useCanvasViewportControls } from '../hooks/useCanvasViewportControls'
import { useEnsureDefaultCanvasNode } from '../hooks/useEnsureDefaultCanvasNode'

export function MainScreen() {
  const { ref: stageContainerRef, size } = useCanvasStageSize()
  const nodeIds = useCanvasNodeIds()
  const { viewport, handleStageDragMove, handleWheel } =
    useCanvasViewportControls()

  useEnsureDefaultCanvasNode()

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
