import { Stage, Layer, Rect } from 'react-konva'
import {
  RichTextNode,
  RichTextNodeControls,
  RichTextNodeText,
} from './RichTextNode'
import { CanvasEdges } from './CanvasEdges'
import { CanvasHelperLines } from './CanvasHelperLines'
import { CanvasViewportPanel } from './CanvasViewportPanel'
import { SelectedNodeToolbar } from './SelectedNodeToolbar'
import { SelectedNodesFrame } from './SelectedNodesFrame'
import {
  useCanvasActions,
  useCanvasNodeIds,
} from '@/store/canvasStore'
import { LexicalOverlayWrapper } from '@/features/lexical/LexicalOverlay'
import { useCanvasStageSize } from '../hooks/useCanvasStageSize'
import { useCanvasMarqueeSelection } from '../hooks/useCanvasMarqueeSelection'
import { useCanvasViewportControls } from '../hooks/useCanvasViewportControls'
import { useEnsureDefaultCanvasNode } from '../hooks/useEnsureDefaultCanvasNode'
import { useCanvasLayout } from '../hooks/useCanvasLayout'
import { CanvasHelperLinesProvider } from '../hooks/useCanvasHelperLines'
import { useCallback } from 'react'
import type { KonvaEventObject } from 'konva/lib/Node'
import { TEST_IDS } from '@/constants'
import type { NodeId } from '../model/types'
import { CANVAS_MARQUEE_FILL, CANVAS_SELECT_COLOR } from '../themeColors'

export function MainScreen() {
  const { ref: stageContainerRef, size } = useCanvasStageSize()
  const nodeIds = useCanvasNodeIds()
  const { selectNode } = useCanvasActions()
  const { handleLayoutGraph, isLayoutPending } = useCanvasLayout(size)
  const {
    viewport,
    canFitView,
    canZoomIn,
    canZoomOut,
    fitView,
    handleStageDragMove,
    handleWheel,
    zoomIn,
    zoomOut,
  } = useCanvasViewportControls(size)
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
    <CanvasHelperLinesProvider>
      <div
        data-node-count={nodeIds.length}
        data-testid={TEST_IDS.CANVAS_STAGE_CONTAINER}
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
          <Layer listening={false}>
            <CanvasEdges />
          </Layer>
          <Layer>
            {nodeIds.map((id: NodeId) => (
              <RichTextNode key={id} nodeId={id} />
            ))}
          </Layer>
          <Layer listening={false}>
            {nodeIds.map((id: NodeId) => (
              <RichTextNodeText key={id} nodeId={id} />
            ))}
          </Layer>
          <Layer>
            <SelectedNodesFrame />
            {nodeIds.map((id: NodeId) => (
              <RichTextNodeControls key={id} nodeId={id} />
            ))}
          </Layer>
          <Layer>
            {selectionRect && (
              <Rect
                x={selectionRect.x}
                y={selectionRect.y}
                width={selectionRect.width}
                height={selectionRect.height}
                fill={CANVAS_MARQUEE_FILL}
                stroke={CANVAS_SELECT_COLOR}
                strokeWidth={1}
                strokeScaleEnabled={false}
                listening={false}
              />
            )}
            <CanvasHelperLines viewport={viewport} stageSize={size} />
          </Layer>
        </Stage>
        <CanvasViewportPanel
          canFitView={canFitView}
          canZoomIn={canZoomIn}
          canZoomOut={canZoomOut}
          isLayoutPending={isLayoutPending}
          onFitView={fitView}
          onLayout={handleLayoutGraph}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
        />
        <SelectedNodeToolbar />
        <LexicalOverlayWrapper />
      </div>
    </CanvasHelperLinesProvider>
  )
}
