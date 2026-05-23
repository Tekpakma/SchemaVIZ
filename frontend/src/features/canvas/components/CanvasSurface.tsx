import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { Stage, Layer, Rect } from 'react-konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import type Konva from 'konva'

import { TEST_IDS } from '@/constants'
import { cn } from '@/lib/utils'
import { LexicalOverlayWrapper } from '@/features/lexical/LexicalOverlay'
import {
  useCanvasActions,
  useCanvasNodeIds,
  useCanvasNodes,
  useSelectedNodeId,
} from '@/store/canvasStore'
import { CanvasEdges } from './CanvasEdges'
import { CanvasExportDialog } from './CanvasExportDialog'
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

const useIsomorphicLayoutEffect =
  typeof window === 'undefined' ? useEffect : useLayoutEffect

type CanvasSurfaceFitWorld = {
  width: number
  height: number
}

type CanvasSurfaceProps = {
  backgroundLayer?: React.ReactNode
  /**
   * HTML overlay rendered above the canvas stage regardless of
   * interaction mode. Use for positioned elements that need to react
   * to the viewport transform (e.g. layer label click targets).
   */
  canvasOverlay?: React.ReactNode
  exportOpen?: boolean
  exportFilterNotice?: string
  fitWorld?: CanvasSurfaceFitWorld
  /**
   * Optional override for the inline rich-text editor. When undefined,
   * the default {@link LexicalOverlayWrapper} is used (mount-per-edit-session).
   * Pass a custom node (e.g. a persistent editor) to opt into a different
   * editor lifecycle. Pass `null` to render nothing.
   */
  inlineEditor?: React.ReactNode
  interactionMode?: 'edit' | 'viewport' | 'static'
  isContentPending?: boolean
  /**
   * Called once after the stage first becomes visible (layout settled,
   * viewport fitted). Receives a PNG data-URL of the rendered canvas.
   * Used by the home-screen preview cache to avoid re-rendering the
   * full Konva stage on revisit.
   */
  onCapture?: (dataUrl: string) => void
  onExportOpenChange?: (open: boolean) => void
  readOnly?: boolean
  seedDefaultNode?: boolean
  showChrome?: boolean
  showChromeEditActions?: boolean
  showFullscreenToggle?: boolean
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

  useIsomorphicLayoutEffect(() => {
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
  canvasOverlay,
  exportOpen = false,
  exportFilterNotice,
  fitWorld,
  inlineEditor,
  interactionMode,
  isContentPending = false,
  onCapture,
  onExportOpenChange,
  readOnly = false,
  seedDefaultNode = true,
  showChrome = true,
  showChromeEditActions,
  showFullscreenToggle = false,
  showNodeToolbar = true,
  showTabBar = true,
}: CanvasSurfaceProps) {
  const resolvedInteractionMode =
    interactionMode ?? (readOnly ? 'static' : 'edit')
  const canEditCanvas = resolvedInteractionMode === 'edit'
  const canUseViewport = resolvedInteractionMode !== 'static'
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [isViewportSettling, setIsViewportSettling] = useState(false)
  const konvaStageRef = useRef<Konva.Stage | null>(null)
  const viewportSettleFrameRef = useRef<number | null>(null)

  const hideStageUntilViewportSettles = useCallback(() => {
    if (viewportSettleFrameRef.current !== null) {
      window.cancelAnimationFrame(viewportSettleFrameRef.current)
    }

    setIsViewportSettling(true)
    viewportSettleFrameRef.current = window.requestAnimationFrame(() => {
      viewportSettleFrameRef.current = window.requestAnimationFrame(() => {
        viewportSettleFrameRef.current = null
        setIsViewportSettling(false)
      })
    })
  }, [])

  useEffect(() => {
    return () => {
      if (viewportSettleFrameRef.current !== null) {
        window.cancelAnimationFrame(viewportSettleFrameRef.current)
      }
    }
  }, [])

  const toggleFullscreen = useCallback(() => {
    setIsResizing(true)
    setIsFullscreen((prev) => !prev)
  }, [])

  // Escape key exits fullscreen
  useEffect(() => {
    if (!isFullscreen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setIsResizing(true)
        setIsFullscreen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [isFullscreen])

  const { ref: stageContainerRef, size } = useCanvasStageSize()

  // Clear the resizing mask once the viewport has settled after the
  // container resize. We wait two animation frames: one for the
  // ResizeObserver → Stage re-render, one for useFitWorldViewport
  // to adjust the viewport.
  useEffect(() => {
    if (!isResizing) return
    let cancelled = false
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!cancelled) setIsResizing(false)
      })
    })
    return () => {
      cancelled = true
    }
  }, [isResizing, size])
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

  const handleFitView = useCallback(() => {
    hideStageUntilViewportSettles()
    fitView()
  }, [fitView, hideStageUntilViewportSettles])

  const handleLayout = useCallback(() => {
    hideStageUntilViewportSettles()
    handleLayoutGraph()
  }, [handleLayoutGraph, hideStageUntilViewportSettles])

  const handleZoomIn = useCallback(() => {
    hideStageUntilViewportSettles()
    zoomIn()
  }, [hideStageUntilViewportSettles, zoomIn])

  const handleZoomOut = useCallback(() => {
    hideStageUntilViewportSettles()
    zoomOut()
  }, [hideStageUntilViewportSettles, zoomOut])

  const handleNodeDragEnd = useCallback(() => {
    clearHelperLines()
  }, [clearHelperLines])

  const isStageMasked =
    isContentPending || isLayoutPending || isResizing || isViewportSettling

  // ── Preview image capture ──────────────────────────────────────────
  // When the stage first becomes visible (layout + viewport settled),
  // capture a PNG snapshot and hand it to the caller for caching.
  const onCaptureRef = useRef(onCapture)
  onCaptureRef.current = onCapture
  const capturedRef = useRef(false)

  useEffect(() => {
    if (isStageMasked || capturedRef.current || !onCaptureRef.current) return
    const stage = konvaStageRef.current
    if (!stage) return
    capturedRef.current = true
    // Two rAFs: first for Konva to flush any pending draws, second
    // to guarantee the composite is complete before reading pixels.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          const dataUrl = stage.toDataURL({ pixelRatio: 1 })
          onCaptureRef.current?.(dataUrl)
        } catch {
          // Silently ignore tainted-canvas or other capture errors.
        }
      })
    })
  }, [isStageMasked])

  return (
    <div
      className={cn(
        'flex h-full min-h-0 flex-col overflow-hidden bg-background',
        isFullscreen && 'fixed inset-0 z-50',
      )}
    >
      {showTabBar && !isFullscreen ? <CanvasTabBar /> : null}
      {/* Sizing wrapper — flex item whose size comes purely from layout,
          not from the Konva <canvas> pixel dimensions inside it. */}
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        <div
          data-node-count={nodeIds.length}
          data-testid={TEST_IDS.CANVAS_STAGE_CONTAINER}
          ref={stageContainerRef}
          aria-busy={isStageMasked}
          style={{
            position: 'absolute',
            inset: 0,
            overflow: 'hidden',
            opacity: isStageMasked ? 0 : 1,
            pointerEvents: isStageMasked ? 'none' : undefined,
          }}
        >
          {hasStageSize ? (
            <Stage
              ref={konvaStageRef}
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
          {canvasOverlay}
          {showChrome && canUseViewport ? (
            <>
              <CanvasViewportPanel
                canFitView={canFitView}
                canZoomIn={canZoomIn}
                canZoomOut={canZoomOut}
                isFullscreen={isFullscreen}
                isLayoutPending={isLayoutPending}
                onFitView={handleFitView}
                onLayout={handleLayout}
                onToggleFullscreen={
                  showFullscreenToggle ? toggleFullscreen : undefined
                }
                onZoomIn={handleZoomIn}
                onZoomOut={handleZoomOut}
                showEditActions={showChromeEditActions ?? canEditCanvas}
              />
              {onExportOpenChange ? (
                <CanvasExportDialog
                  filterNotice={exportFilterNotice}
                  open={exportOpen}
                  onOpenChange={onExportOpenChange}
                  stageRef={konvaStageRef}
                />
              ) : null}
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
        {isContentPending || isLayoutPending ? (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-background">
            <div className="size-5 animate-spin rounded-full border-2 border-border border-t-foreground" />
          </div>
        ) : null}
      </div>
    </div>
  )
}
