import { useCallback, useEffect } from 'react'
import { Stage, Layer, Rect } from 'react-konva'
import type { KonvaEventObject } from 'konva/lib/Node'

import { TEST_IDS } from '@/constants'
import { LexicalOverlayWrapper } from '@/features/lexical/LexicalOverlay'
import {
  useCanvasActions,
  useCanvasNodeIds,
  useCanvasViewport,
} from '@/store/canvasStore'
import { CanvasEdges } from './CanvasEdges'
import { CanvasHelperLines } from './CanvasHelperLines'
import { CanvasTabBar } from './CanvasTabBar'
import { CanvasViewportPanel } from './CanvasViewportPanel'
import {
  RichTextNode,
  RichTextNodeControls,
  RichTextNodeText,
} from './RichTextNode'
import { SelectedNodeToolbar } from './SelectedNodeToolbar'
import { SelectedNodesFrame } from './SelectedNodesFrame'
import { useCanvasHelperLines } from '../hooks/useCanvasHelperLines'
import { useCanvasLayout } from '../hooks/useCanvasLayout'
import { useCanvasMarqueeSelection } from '../hooks/useCanvasMarqueeSelection'
import { useCanvasStageSize } from '../hooks/useCanvasStageSize'
import { useCanvasViewportControls } from '../hooks/useCanvasViewportControls'
import { useEnsureDefaultCanvasNode } from '../hooks/useEnsureDefaultCanvasNode'
import type { NodeId } from '../model/types'
import { CANVAS_MARQUEE_FILL, CANVAS_SELECT_COLOR } from '../themeColors'

type CanvasSurfaceFitWorld = {
  width: number
  height: number
}

type CanvasSurfaceProps = {
  backgroundLayer?: React.ReactNode
  fitWorld?: CanvasSurfaceFitWorld
  readOnly?: boolean
  seedDefaultNode?: boolean
  showChrome?: boolean
  showTabBar?: boolean
}

function useFitWorldViewport(
  fitWorld: CanvasSurfaceFitWorld | undefined,
  stageSize: { width: number; height: number },
) {
  const viewport = useCanvasViewport()
  const { setViewport } = useCanvasActions()
  const fitWorldWidth = fitWorld?.width
  const fitWorldHeight = fitWorld?.height

  useEffect(() => {
    if (
      fitWorldWidth === undefined ||
      fitWorldHeight === undefined ||
      stageSize.width === 0 ||
      stageSize.height === 0
    ) {
      return
    }

    const scale = Math.min(
      stageSize.width / fitWorldWidth,
      stageSize.height / fitWorldHeight,
    )
    const nextViewport = {
      x: (stageSize.width - fitWorldWidth * scale) / 2,
      y: (stageSize.height - fitWorldHeight * scale) / 2,
      scale,
    }

    if (
      viewport.x === nextViewport.x &&
      viewport.y === nextViewport.y &&
      viewport.scale === nextViewport.scale
    ) {
      return
    }

    setViewport(nextViewport, { markDirty: false })
  }, [
    fitWorldHeight,
    fitWorldWidth,
    setViewport,
    stageSize.height,
    stageSize.width,
    viewport.scale,
    viewport.x,
    viewport.y,
  ])
}

export function CanvasSurface({
  backgroundLayer,
  fitWorld,
  readOnly = false,
  seedDefaultNode = true,
  showChrome = true,
  showTabBar = true,
}: CanvasSurfaceProps) {
  const { ref: stageContainerRef, size } = useCanvasStageSize()
  const nodeIds = useCanvasNodeIds()
  const { selectNode } = useCanvasActions()
  const { clearHelperLines } = useCanvasHelperLines()
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

  useFitWorldViewport(fitWorld, size)

  useEnsureDefaultCanvasNode(seedDefaultNode)

  const handleStagePointerDown = useCallback(
    (event: KonvaEventObject<MouseEvent>) => {
      if (readOnly) return
      if (handleMarqueeMouseDown(event)) return
      if (event.target !== event.currentTarget) return

      selectNode(null)
    },
    [handleMarqueeMouseDown, readOnly, selectNode],
  )

  const handleStageTouchStart = useCallback(
    (event: KonvaEventObject<TouchEvent>) => {
      if (readOnly) return
      if (event.target !== event.currentTarget) return

      selectNode(null)
    },
    [readOnly, selectNode],
  )

  const handleStageMouseMove = useCallback(
    (event: KonvaEventObject<MouseEvent>) => {
      if (readOnly) return
      handleMarqueeMouseMove(event)
    },
    [handleMarqueeMouseMove, readOnly],
  )

  const handleStageMouseUp = useCallback(
    (_event: KonvaEventObject<MouseEvent>) => {
      if (readOnly) return
      handleMarqueeMouseUp()
    },
    [handleMarqueeMouseUp, readOnly],
  )

  const handleStageWheel = useCallback(
    (event: KonvaEventObject<WheelEvent>) => {
      if (readOnly) return
      handleWheel(event)
    },
    [handleWheel, readOnly],
  )

  const handleStageDrag = useCallback(
    (event: KonvaEventObject<DragEvent>) => {
      if (readOnly) return
      handleStageDragMove(event)
    },
    [handleStageDragMove, readOnly],
  )

  const handleNodeDragEnd = useCallback(() => {
    clearHelperLines()
  }, [clearHelperLines])

  return (
    <div className="flex h-full min-h-0 flex-col">
      {showTabBar ? <CanvasTabBar /> : null}
      <div
        data-node-count={nodeIds.length}
        data-testid={TEST_IDS.CANVAS_STAGE_CONTAINER}
        ref={stageContainerRef}
        style={{
          position: 'relative',
          width: '100%',
          flex: 1,
          minHeight: 0,
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
          draggable={!readOnly && !isSelecting}
          onDragMove={handleStageDrag}
          onDragEnd={handleStageDrag}
          onWheel={handleStageWheel}
          onMouseDown={handleStagePointerDown}
          onMouseMove={handleStageMouseMove}
          onMouseUp={handleStageMouseUp}
          onTouchStart={handleStageTouchStart}
        >
          {backgroundLayer ? (
            <Layer listening={false}>{backgroundLayer}</Layer>
          ) : null}
          <Layer listening={false}>
            <CanvasEdges />
          </Layer>
          <Layer listening={!readOnly}>
            {nodeIds.map((id: NodeId) => (
              <RichTextNode
                key={id}
                nodeId={id}
                onDragEnd={handleNodeDragEnd}
                readOnly={readOnly}
              />
            ))}
          </Layer>
          <Layer listening={false}>
            {nodeIds.map((id: NodeId) => (
              <RichTextNodeText key={id} nodeId={id} />
            ))}
          </Layer>
          {!readOnly ? (
            <Layer>
              <SelectedNodesFrame />
              {nodeIds.map((id: NodeId) => (
                <RichTextNodeControls key={id} nodeId={id} />
              ))}
            </Layer>
          ) : null}
          {!readOnly ? (
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
          ) : null}
        </Stage>
        {showChrome && !readOnly ? (
          <>
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
          </>
        ) : null}
      </div>
    </div>
  )
}
