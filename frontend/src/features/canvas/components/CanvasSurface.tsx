import { useCallback, useEffect, useRef } from 'react'
import { Stage, Layer, Rect } from 'react-konva'
import type { KonvaEventObject } from 'konva/lib/Node'

import { TEST_IDS } from '@/constants'
import { LexicalOverlayWrapper } from '@/features/lexical/LexicalOverlay'
import {
  useCanvasActions,
  useCanvasNodeIds,
  useCanvasNodes,
  useSelectedNodeId,
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
import type { CanvasNode, NodeId } from '../model/types'
import { isEditableNodeKind } from '../model/types'
import { CANVAS_MARQUEE_FILL, CANVAS_SELECT_COLOR } from '../themeColors'

type CanvasSurfaceFitWorld = {
  width: number
  height: number
}

type CanvasSurfaceProps = {
  backgroundLayer?: React.ReactNode
  fitWorld?: CanvasSurfaceFitWorld
  /**
   * Optional override for the inline rich-text editor. When undefined,
   * the default {@link LexicalOverlayWrapper} is used (mount-per-edit-session).
   * Pass a custom node (e.g. a persistent editor) to opt into a different
   * editor lifecycle. Pass `null` to render nothing.
   */
  inlineEditor?: React.ReactNode
  interactionMode?: 'edit' | 'viewport' | 'static'
  readOnly?: boolean
  seedDefaultNode?: boolean
  showChrome?: boolean
  showNodeToolbar?: boolean
  showTabBar?: boolean
}

function useFitWorldViewport(
  fitWorld: CanvasSurfaceFitWorld | undefined,
  stageSize: { width: number; height: number },
) {
  const { setViewport } = useCanvasActions()
  const fitWorldWidth = fitWorld?.width
  const fitWorldHeight = fitWorld?.height
  const appliedFitKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (
      fitWorldWidth === undefined ||
      fitWorldHeight === undefined ||
      stageSize.width === 0 ||
      stageSize.height === 0
    ) {
      return
    }

    const fitKey = `${fitWorldWidth}:${fitWorldHeight}:${stageSize.width}:${stageSize.height}`
    if (appliedFitKeyRef.current === fitKey) return

    const scale = Math.min(
      stageSize.width / fitWorldWidth,
      stageSize.height / fitWorldHeight,
    )
    const nextViewport = {
      x: (stageSize.width - fitWorldWidth * scale) / 2,
      y: (stageSize.height - fitWorldHeight * scale) / 2,
      scale,
    }

    setViewport(nextViewport, { markDirty: false })
    appliedFitKeyRef.current = fitKey
  }, [
    fitWorldHeight,
    fitWorldWidth,
    setViewport,
    stageSize.height,
    stageSize.width,
  ])
}

export function CanvasSurface({
  backgroundLayer,
  fitWorld,
  inlineEditor,
  interactionMode,
  readOnly = false,
  seedDefaultNode = true,
  showChrome = true,
  showNodeToolbar = true,
  showTabBar = true,
}: CanvasSurfaceProps) {
  const resolvedInteractionMode =
    interactionMode ?? (readOnly ? 'static' : 'edit')
  const canEditCanvas = resolvedInteractionMode === 'edit'
  const canUseViewport = resolvedInteractionMode !== 'static'
  const { ref: stageContainerRef, size } = useCanvasStageSize()
  const nodeIds = useCanvasNodeIds()
  const nodesById = useCanvasNodes()
  const selectedNodeId = useSelectedNodeId()
  const { selectNode, startEditing } = useCanvasActions()
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
  const hasStageSize = size.width > 0 && size.height > 0

  useFitWorldViewport(fitWorld, size)

  useEnsureDefaultCanvasNode(seedDefaultNode)

  const getEditableNodeAtPointer = useCallback(
    (pointer: { x: number; y: number }): CanvasNode | null => {
      const worldPoint = {
        x: (pointer.x - viewport.x) / viewport.scale,
        y: (pointer.y - viewport.y) / viewport.scale,
      }
      const orderedNodes = [...nodeIds].reverse().flatMap((id) => {
        const node = nodesById[id]
        return node ? [node] : []
      })
      const selectedNode = selectedNodeId ? nodesById[selectedNodeId] : null
      const candidates = selectedNode
        ? [
            selectedNode,
            ...orderedNodes.filter((node) => node.id !== selectedNode.id),
          ]
        : orderedNodes

      return (
        candidates.find((node) => {
          if (!isEditableNodeKind(node.kind)) return false
          return (
            worldPoint.x >= node.x &&
            worldPoint.x <= node.x + node.width &&
            worldPoint.y >= node.y &&
            worldPoint.y <= node.y + node.height
          )
        }) ?? null
      )
    },
    [
      nodeIds,
      nodesById,
      selectedNodeId,
      viewport.scale,
      viewport.x,
      viewport.y,
    ],
  )

  const startEditingNodeAtPointer = useCallback(
    (event: KonvaEventObject<MouseEvent | TouchEvent>) => {
      if (!canEditCanvas) return

      const pointer = event.target.getStage()?.getPointerPosition()
      if (!pointer) return

      const node = getEditableNodeAtPointer(pointer)
      if (!node) return

      event.cancelBubble = true
      window.setTimeout(() => startEditing(node.id), 0)
    },
    [canEditCanvas, getEditableNodeAtPointer, startEditing],
  )

  const handleStagePointerDown = useCallback(
    (event: KonvaEventObject<MouseEvent>) => {
      if (!canEditCanvas) return

      if (handleMarqueeMouseDown(event)) return
      if (event.target !== event.currentTarget) return

      selectNode(null)
    },
    [
      canEditCanvas,
      handleMarqueeMouseDown,
      selectNode,
      startEditingNodeAtPointer,
    ],
  )

  const handleStageTouchStart = useCallback(
    (event: KonvaEventObject<TouchEvent>) => {
      if (!canEditCanvas) return
      if (event.target !== event.currentTarget) return

      selectNode(null)
    },
    [canEditCanvas, selectNode],
  )

  const handleStageDoubleClick = useCallback(
    (event: KonvaEventObject<MouseEvent | TouchEvent>) => {
      startEditingNodeAtPointer(event)
    },
    [startEditingNodeAtPointer],
  )

  const handleStageMouseMove = useCallback(
    (event: KonvaEventObject<MouseEvent>) => {
      if (!canEditCanvas) return
      handleMarqueeMouseMove(event)
    },
    [canEditCanvas, handleMarqueeMouseMove],
  )

  const handleStageMouseUp = useCallback(
    (_event: KonvaEventObject<MouseEvent>) => {
      if (!canEditCanvas) return
      handleMarqueeMouseUp()
    },
    [canEditCanvas, handleMarqueeMouseUp],
  )

  const handleStageWheel = useCallback(
    (event: KonvaEventObject<WheelEvent>) => {
      if (!canUseViewport) return
      handleWheel(event)
    },
    [canUseViewport, handleWheel],
  )

  const handleStageDrag = useCallback(
    (event: KonvaEventObject<DragEvent>) => {
      if (!canUseViewport) return
      handleStageDragMove(event)
    },
    [canUseViewport, handleStageDragMove],
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
        {hasStageSize ? (
          <Stage
            width={size.width}
            height={size.height}
            x={viewport.x}
            y={viewport.y}
            scaleX={viewport.scale}
            scaleY={viewport.scale}
            draggable={canUseViewport && !isSelecting}
            onDragMove={handleStageDrag}
            onDragEnd={handleStageDrag}
            onWheel={handleStageWheel}
            onMouseDown={handleStagePointerDown}
            onDblClick={handleStageDoubleClick}
            onDblTap={handleStageDoubleClick}
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
            <Layer listening={canEditCanvas}>
              {nodeIds.map((id: NodeId) => (
                <RichTextNode
                  key={id}
                  nodeId={id}
                  onDragEnd={handleNodeDragEnd}
                  readOnly={!canEditCanvas}
                />
              ))}
            </Layer>
            <Layer listening={false}>
              {nodeIds.map((id: NodeId) => (
                <RichTextNodeText key={id} nodeId={id} />
              ))}
            </Layer>
            {canEditCanvas ? (
              // Single overlay layer for all edit-mode visuals: transformer
              // controls, selected-node frame, marquee, and helper lines.
              // Each Konva layer is a separate <canvas> element with its own
              // memory + composite cost; keeping the total ≤5 matches
              // Konva's recommendation.
              <Layer>
                <SelectedNodesFrame />
                {nodeIds.map((id: NodeId) => (
                  <RichTextNodeControls key={id} nodeId={id} />
                ))}
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
                    perfectDrawEnabled={false}
                    listening={false}
                  />
                )}
                <CanvasHelperLines viewport={viewport} stageSize={size} />
              </Layer>
            ) : null}
          </Stage>
        ) : null}
        {showChrome && canUseViewport ? (
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
              showEditActions={canEditCanvas}
            />
            {canEditCanvas ? (
              <>
                {showNodeToolbar ? <SelectedNodeToolbar /> : null}
                {inlineEditor === undefined ? (
                  <LexicalOverlayWrapper />
                ) : (
                  inlineEditor
                )}
              </>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  )
}
