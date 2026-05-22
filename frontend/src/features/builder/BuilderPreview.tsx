import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { Text as KonvaText } from 'react-konva'

import { CanvasSurface } from '@/features/canvas/components/CanvasSurface'
import { getCanvasFitViewportForFrames } from '@/features/canvas/fitView'
import { CanvasHelperLinesProvider } from '@/features/canvas/hooks/useCanvasHelperLines'
import { layoutCanvasGraph } from '@/features/canvas/layout.functions'
import type { CanvasEdge, CanvasNode } from '@/features/canvas/model/types'
import {
  getBuilderPreviewFlowDirection,
  getBuilderPreviewLayoutOptions,
} from '@/features/elk/algorithms'
import { useTheme } from '@/features/theme/useTheme'
import { cn } from '@/lib/utils'
import {
  CanvasStoreProvider,
  useCanvasActions,
  useCanvasNodes,
  useCanvasSnapshotGetters,
  useCanvasStageSizeValue,
  useCanvasStoreInstance,
  useSelectedNodeId,
} from '@/store/canvasStore'
import {
  BUILDER_PREVIEW_STAGE_HEIGHT,
  BUILDER_PREVIEW_STAGE_WIDTH,
  getBuilderPreviewCanvasGraph,
} from './builderPreviewLayout'
import type { BuilderPreviewCanvasLayer } from './builderPreviewLayout'
import { BuilderInlineEditor } from './BuilderInlineEditor'
import type { FlushInlineNodeEdit } from './BuilderInlineEditor'
import { getGenerationPreviewCanvasGraph } from './generationPreviewGraph'
import { LayerLabelsOverlay } from './LayerLabelsOverlay'
import type { LayerLabelCommit } from './LayerLabelsOverlay'
import type { GenerationRunResponse } from './generationPreviewQuery'
import type { RecipeData } from './types'

const BUILDER_PREVIEW_FIT_WORLD = {
  width: BUILDER_PREVIEW_STAGE_WIDTH,
  height: BUILDER_PREVIEW_STAGE_HEIGHT,
}
const BUILDER_PREVIEW_FIT_PADDING = 80
const LAYER_LABEL_MIN_WIDTH = 160
const LAYER_LABEL_TOP_GAP = 30

function getLayerBounds(
  layer: BuilderPreviewCanvasLayer,
  nodes: Record<string, CanvasNode>,
) {
  const frames = layer.nodeIds.flatMap((nodeId) => {
    const node = nodes[nodeId]
    return node ? [node] : []
  })

  if (frames.length === 0) return null

  const minX = Math.min(...frames.map((node) => node.x))
  const maxX = Math.max(...frames.map((node) => node.x + node.width))
  const minY = Math.min(...frames.map((node) => node.y))

  return { maxX, minX, minY }
}

// ---------------------------------------------------------------------------
// Extract dominant style from Lexical textContent JSON for Konva rendering
// ---------------------------------------------------------------------------

type LexicalLabelStyle = {
  color?: string
  isBold: boolean
  isItalic: boolean
  isUnderline: boolean
}

const DEFAULT_LABEL_STYLE: LexicalLabelStyle = {
  isBold: false,
  isItalic: false,
  isUnderline: false,
}

/**
 * Walks the Lexical JSON to find the first text node and extracts
 * its format flags + inline CSS color. This gives us a "dominant style"
 * to apply to the Konva label — a best-effort visual match without
 * full HTML rendering.
 *
 * Lexical text format is a bitmask: 1=bold, 2=italic, 8=underline
 */
function extractLabelStyleFromTextContent(
  textContent: unknown,
): LexicalLabelStyle {
  if (!textContent || typeof textContent !== 'object')
    return DEFAULT_LABEL_STYLE

  try {
    const root = (textContent as Record<string, unknown>).root as
      | Record<string, unknown>
      | undefined
    if (!root) return DEFAULT_LABEL_STYLE

    // Walk children to find the first text node
    const children = root.children as unknown[] | undefined
    if (!Array.isArray(children)) return DEFAULT_LABEL_STYLE

    for (const paragraph of children) {
      if (!paragraph || typeof paragraph !== 'object') continue
      const paraChildren = (paragraph as Record<string, unknown>)
        .children as unknown[]
      if (!Array.isArray(paraChildren)) continue

      for (const node of paraChildren) {
        if (!node || typeof node !== 'object') continue
        const n = node as Record<string, unknown>
        if (n.type !== 'text') continue

        const format = typeof n.format === 'number' ? n.format : 0
        const style = typeof n.style === 'string' ? n.style : ''

        // Extract color from inline style string, e.g. "color: #ff0000"
        let color: string | undefined
        const colorMatch = /color:\s*([^;]+)/i.exec(style)
        if (colorMatch) {
          color = colorMatch[1]!.trim()
        }

        return {
          color,
          isBold: (format & 1) !== 0,
          isItalic: (format & 2) !== 0,
          isUnderline: (format & 8) !== 0,
        }
      }
    }
  } catch {
    // Graceful fallback
  }

  return DEFAULT_LABEL_STYLE
}

function BuilderPreviewLayerScaffold({
  editingLayerLabelId,
  layers,
}: {
  editingLayerLabelId?: string | null
  layers: BuilderPreviewCanvasLayer[]
}) {
  const nodes = useCanvasNodes()
  const { resolvedTheme } = useTheme()
  const defaultLabelFill =
    resolvedTheme === 'dark'
      ? 'rgba(244, 244, 245, 0.46)'
      : 'rgba(113, 113, 122, 0.64)'

  return (
    <>
      {layers.map((layer) => {
        if (editingLayerLabelId === layer.id) return null
        const bounds = getLayerBounds(layer, nodes)
        if (!bounds) return null

        const columnWidth = Math.max(
          LAYER_LABEL_MIN_WIDTH,
          bounds.maxX - bounds.minX,
        )
        const x = bounds.minX + (bounds.maxX - bounds.minX - columnWidth) / 2
        const y = Math.max(4, bounds.minY - LAYER_LABEL_TOP_GAP)

        // Apply styles from textContent if the layer has been styled;
        // otherwise fall back to the default bold monospace look.
        const hasCustomStyle = !!layer.textContent
        const style = hasCustomStyle
          ? extractLabelStyleFromTextContent(layer.textContent)
          : DEFAULT_LABEL_STYLE
        const fill = style.color || defaultLabelFill
        const fontStyle = hasCustomStyle
          ? [style.isBold ? 'bold' : '', style.isItalic ? 'italic' : '']
              .filter(Boolean)
              .join(' ') || 'normal'
          : 'bold'
        const textDecoration = style.isUnderline ? 'underline' : undefined

        return (
          <KonvaText
            key={layer.id}
            align="center"
            fill={fill}
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            fontSize={11}
            fontStyle={fontStyle}
            letterSpacing={3}
            listening={false}
            text={layer.label}
            textDecoration={textDecoration}
            width={columnWidth}
            x={x}
            y={y}
          />
        )
      })}
    </>
  )
}

function getGraphFitWorld(nodes: CanvasNode[]) {
  if (nodes.length === 0) return BUILDER_PREVIEW_FIT_WORLD

  const maxX = Math.max(...nodes.map((node) => node.x + node.width))
  const maxY = Math.max(...nodes.map((node) => node.y + node.height))

  return {
    width: Math.max(
      BUILDER_PREVIEW_STAGE_WIDTH,
      maxX + BUILDER_PREVIEW_FIT_PADDING,
    ),
    height: Math.max(
      BUILDER_PREVIEW_STAGE_HEIGHT,
      maxY + BUILDER_PREVIEW_FIT_PADDING,
    ),
  }
}

// ---------------------------------------------------------------------------
// Auto-layout: runs ELK to position all nodes (compound groups + children)
// ---------------------------------------------------------------------------

function BuilderPreviewAutoLayout({
  layoutAlgorithm,
  layoutDirection,
  layoutKey,
  layoutSignature,
  nodeCount,
  onLayoutSettled,
}: {
  layoutAlgorithm: RecipeData['layoutAlgorithm']
  layoutDirection: RecipeData['layoutDirection']
  layoutKey: string
  layoutSignature: string
  nodeCount: number
  onLayoutSettled: (layoutSignature: string) => void
}) {
  const { applyGraphLayout } = useCanvasActions()
  const { getActiveCanvasTabIdSnapshot, getCanvasLayoutSnapshot } =
    useCanvasSnapshotGetters()
  const stageSize = useCanvasStageSizeValue()
  const runLayout = useServerFn(layoutCanvasGraph)
  const layoutOptions = useMemo(
    () => getBuilderPreviewLayoutOptions(layoutAlgorithm),
    [layoutAlgorithm],
  )
  const flowDirection = useMemo(
    () => getBuilderPreviewFlowDirection(layoutDirection),
    [layoutDirection],
  )

  // useMutation gives us automatic last-write-wins: calling mutate()
  // while a previous call is in-flight resets the mutation state so the
  // stale .onSuccess never fires for the superseded request.
  const { mutate: runAutoLayoutMutation } = useMutation({
    mutationFn: (input: {
      layoutSignature: string
      tabId: string
      snapshot: ReturnType<typeof getCanvasLayoutSnapshot>
    }) =>
      runLayout({
        data: {
          ...input.snapshot,
          flowDirection,
          layoutOptions,
        },
      }),
    onSuccess: (
      result,
      { layoutSignature: completedLayoutSignature, tabId },
    ) => {
      const fitWorld =
        stageSize.width > 0 && stageSize.height > 0
          ? stageSize
          : BUILDER_PREVIEW_FIT_WORLD
      const nextViewport = getCanvasFitViewportForFrames(
        result.nodeFrames,
        fitWorld,
      )
      applyGraphLayout(result, { tabId, viewport: nextViewport })
      onLayoutSettled(completedLayoutSignature)
    },
    onError: (_error, { layoutSignature: completedLayoutSignature }) => {
      onLayoutSettled(completedLayoutSignature)
    },
  })

  useEffect(() => {
    if (nodeCount === 0) return
    if (stageSize.width === 0 || stageSize.height === 0) return

    const tabId = getActiveCanvasTabIdSnapshot()
    const snapshot = getCanvasLayoutSnapshot(tabId)

    runAutoLayoutMutation({ layoutSignature, tabId, snapshot })
  }, [
    layoutKey,
    layoutSignature,
    nodeCount,
    flowDirection,
    layoutOptions,
    onLayoutSettled,
    runAutoLayoutMutation,
    stageSize,
    getActiveCanvasTabIdSnapshot,
    getCanvasLayoutSnapshot,
  ])

  return null
}

// ---------------------------------------------------------------------------
// Selection bridge: reports canvas selection changes to the parent
// ---------------------------------------------------------------------------

function SelectionBridge({
  onNodeSelect,
}: {
  onNodeSelect?: (nodeId: string | null) => void
}) {
  const selectedNodeId = useSelectedNodeId()
  const prevRef = useRef<string | null>(null)

  useEffect(() => {
    if (selectedNodeId !== prevRef.current) {
      prevRef.current = selectedNodeId
      onNodeSelect?.(selectedNodeId)
    }
  }, [selectedNodeId, onNodeSelect])

  return null
}

// ---------------------------------------------------------------------------
// Commit bridge: intercepts canvas text commits and forwards to parent
// ---------------------------------------------------------------------------

export type BuilderPreviewCommit = {
  nodeId: string
  lexicalJson: string
  html: string
  contentHeight: number
}

function CommitBridge({
  onCommitNodeText,
}: {
  onCommitNodeText?: (commit: BuilderPreviewCommit) => void
}) {
  const store = useCanvasStoreInstance()
  const callbackRef = useRef(onCommitNodeText)
  callbackRef.current = onCommitNodeText

  useEffect(() => {
    if (!callbackRef.current) return

    // Subscribe to canvas store changes — detect commitNodeText by watching
    // node version bumps while editingNodeId clears (stopEditing follows commit)
    let prevEditingNodeId: string | null = store.getState().editingNodeId

    const unsub = store.subscribe((state) => {
      const wasEditing = prevEditingNodeId
      const nowEditing = state.editingNodeId
      if (wasEditing !== nowEditing) {
        console.log('[CommitBridge] editingNodeId transition', {
          wasEditing,
          nowEditing,
        })
      }
      prevEditingNodeId = nowEditing

      // Commit happened: was editing a node, now not editing
      if (wasEditing && !nowEditing && callbackRef.current) {
        const activeTab = state.tabsById[state.activeTabId]
        if (!activeTab) return
        const node = activeTab.document.nodesById[wasEditing]
        if (!node) return

        console.log('[CommitBridge] FIRING onCommitNodeText', {
          nodeId: wasEditing,
        })
        callbackRef.current({
          nodeId: wasEditing,
          lexicalJson: node.lexicalJson,
          html: node.html,
          contentHeight: node.contentHeight,
        })
      }
    })

    return unsub
  }, [store])

  return null
}

// ---------------------------------------------------------------------------
// Resize bridge: detects node frame changes from canvas resize handles
// ---------------------------------------------------------------------------

export type BuilderPreviewResize = {
  nodeId: string
  width: number
  height: number
}

function ResizeBridge({
  onNodeResize,
}: {
  onNodeResize?: (resize: BuilderPreviewResize) => void
}) {
  const store = useCanvasStoreInstance()
  const callbackRef = useRef(onNodeResize)
  callbackRef.current = onNodeResize

  useEffect(() => {
    if (!callbackRef.current) return

    // Track node dimensions to detect resize via Transformer handles.
    // We snapshot the selected node's dimensions and compare on each
    // store update — `updateNodeFrame` bumps `version`, which triggers
    // the subscription.
    const prevNodeSizes = new Map<string, { w: number; h: number }>()

    const unsub = store.subscribe((state) => {
      if (!callbackRef.current) return
      // Skip while editing — the Transformer is hidden in edit mode, so
      // any width/height change must be from auto-layout, not the user.
      // Persisting it would corrupt the recipe and remount the canvas.
      if (state.editingNodeId) return
      const activeTab = state.tabsById[state.activeTabId]
      if (!activeTab) return

      const selectedId = activeTab.document.selectedNodeId
      if (!selectedId) return

      const node = activeTab.document.nodesById[selectedId]
      if (!node || node.kind === 'group') return

      const prev = prevNodeSizes.get(selectedId)
      const w = Math.round(node.width)
      const h = Math.round(node.height)

      if (prev && (prev.w !== w || prev.h !== h)) {
        console.log('[ResizeBridge] FIRING onNodeResize', {
          nodeId: selectedId,
          prev,
          next: { w, h },
        })
        callbackRef.current({ nodeId: selectedId, width: w, height: h })
      }
      prevNodeSizes.set(selectedId, { w, h })
    })

    return unsub
  }, [store])

  return null
}

// ---------------------------------------------------------------------------
// Graph reconciler: pushes recipe-derived graph changes into the (long-lived)
// canvas store WITHOUT remounting it. Preserves editingNodeId, selection,
// viewport, and live node positions.
// ---------------------------------------------------------------------------

function GraphReconciler({
  graph,
  preserveGeometry,
}: {
  graph: { nodes: CanvasNode[]; edges: CanvasEdge[] }
  preserveGeometry: boolean
}) {
  const { reconcileGraph } = useCanvasActions()
  const isFirstRun = useRef(true)

  useEffect(() => {
    // The first render already seeded the store via initialGraph, so skip.
    if (isFirstRun.current) {
      isFirstRun.current = false
      return
    }
    console.log('[GraphReconciler] reconciling', {
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length,
    })
    reconcileGraph(
      { nodes: graph.nodes, edges: graph.edges },
      { preserveGeometry },
    )
  }, [graph, preserveGeometry, reconcileGraph])

  return null
}

// ---------------------------------------------------------------------------
// Canvas surface wrapper
// ---------------------------------------------------------------------------

function BuilderPreviewCanvas({
  layoutAlgorithm,
  layoutDirection,
  graph,
  autoLayout,
  exportOpen,
  interactionMode,
  layers,
  nodeCount,
  onCapture,
  onCommitNodeText,
  onExportOpenChange,
  onNodeResize,
  onNodeSelect,
  onRegisterFlushInlineEdit,
  onRenameLayer,
  onSetLayerTextContent,
}: {
  graph: { nodes: CanvasNode[]; edges: CanvasEdge[]; key: string }
  layoutAlgorithm: RecipeData['layoutAlgorithm']
  layoutDirection: RecipeData['layoutDirection']
  autoLayout: boolean
  exportOpen?: boolean
  interactionMode: 'edit' | 'viewport' | 'static'
  layers: BuilderPreviewCanvasLayer[]
  nodeCount: number
  onCapture?: (dataUrl: string) => void
  onCommitNodeText?: (commit: BuilderPreviewCommit) => void
  onExportOpenChange?: (open: boolean) => void
  onNodeResize?: (resize: BuilderPreviewResize) => void
  onNodeSelect?: (nodeId: string | null) => void
  onRegisterFlushInlineEdit?: (flush: FlushInlineNodeEdit | null) => void
  onRenameLayer?: (layerId: string, label: string) => void
  onSetLayerTextContent?: (layerId: string, textContent: unknown) => void
}) {
  const fitWorld = useMemo(() => getGraphFitWorld(graph.nodes), [graph.nodes])
  const layoutSignature = `${graph.key}:${layoutAlgorithm}:${layoutDirection}:${nodeCount}`
  const [settledLayoutSignature, setSettledLayoutSignature] = useState<
    string | null
  >(null)
  const isAutoLayoutPending =
    autoLayout && nodeCount > 0 && settledLayoutSignature !== layoutSignature

  useEffect(() => {
    if (!autoLayout) setSettledLayoutSignature(null)
  }, [autoLayout])

  // ── Layer label editing ──────────────────────────────────────────
  const [editingLayerLabelId, setEditingLayerLabelId] = useState<string | null>(
    null,
  )

  const handleCommitLayerLabel = useCallback(
    (commit: LayerLabelCommit) => {
      setEditingLayerLabelId(null)
      onRenameLayer?.(commit.layerId, commit.label)
      onSetLayerTextContent?.(commit.layerId, commit.textContent)
    },
    [onRenameLayer, onSetLayerTextContent],
  )

  const layerLabelsOverlay =
    onRenameLayer && layers.length > 0 ? (
      <LayerLabelsOverlay
        editingId={editingLayerLabelId}
        layers={layers}
        onCommitEdit={handleCommitLayerLabel}
        onStartEdit={setEditingLayerLabelId}
      />
    ) : null

  return (
    <CanvasHelperLinesProvider>
      <GraphReconciler graph={graph} preserveGeometry={autoLayout} />
      {autoLayout ? (
        <BuilderPreviewAutoLayout
          layoutAlgorithm={layoutAlgorithm}
          layoutDirection={layoutDirection}
          layoutKey={graph.key}
          layoutSignature={layoutSignature}
          nodeCount={nodeCount}
          onLayoutSettled={setSettledLayoutSignature}
        />
      ) : null}
      <SelectionBridge onNodeSelect={onNodeSelect} />
      {/* CommitBridge is intentionally NOT rendered here. The new
          persistent <BuilderInlineEditor /> calls `onCommitNodeText`
          directly via its `onCommit` prop, which is the reliable path
          (canvas-store subscription was racey and easy to break under
          preview remount). */}
      <ResizeBridge onNodeResize={onNodeResize} />
      <CanvasSurface
        backgroundLayer={
          layers.length > 0 ? (
            <BuilderPreviewLayerScaffold
              editingLayerLabelId={editingLayerLabelId}
              layers={layers}
            />
          ) : undefined
        }
        canvasOverlay={layerLabelsOverlay}
        exportOpen={exportOpen}
        fitWorld={fitWorld}
        inlineEditor={
          <BuilderInlineEditor
            onCommit={onCommitNodeText}
            onRegisterFlush={onRegisterFlushInlineEdit}
          />
        }
        interactionMode={interactionMode}
        isContentPending={isAutoLayoutPending}
        onCapture={onCapture}
        onExportOpenChange={onExportOpenChange}
        seedDefaultNode={false}
        showChrome
        showChromeEditActions={false}
        showFullscreenToggle
        showNodeToolbar={false}
        showTabBar={false}
      />
    </CanvasHelperLinesProvider>
  )
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export function BuilderPreview({
  autoLayout = true,
  className,
  exportOpen,
  generationResponse,
  interactionMode = 'viewport',
  onCapture,
  onCommitNodeText,
  onExportOpenChange,
  onNodeResize,
  onNodeSelect,
  onRegisterFlushInlineEdit,
  onRenameLayer,
  onSetLayerTextContent,
  recipe,
  showEdges = true,
}: {
  autoLayout?: boolean
  className?: string
  exportOpen?: boolean
  generationResponse?: GenerationRunResponse
  interactionMode?: 'edit' | 'viewport' | 'static'
  /** Called once with a PNG data-URL after the canvas first renders. */
  onCapture?: (dataUrl: string) => void
  onCommitNodeText?: (commit: BuilderPreviewCommit) => void
  onExportOpenChange?: (open: boolean) => void
  onNodeResize?: (resize: BuilderPreviewResize) => void
  onNodeSelect?: (nodeId: string | null) => void
  onRegisterFlushInlineEdit?: (flush: FlushInlineNodeEdit | null) => void
  onRenameLayer?: (layerId: string, label: string) => void
  onSetLayerTextContent?: (layerId: string, textContent: unknown) => void
  recipe: RecipeData
  showEdges?: boolean
}) {
  const graph = useMemo(() => {
    if (generationResponse) {
      return getGenerationPreviewCanvasGraph(generationResponse, recipe)
    }

    // Static preview (steps 1–5): flat layout (no group nesting — ELK
    // isn't running to size containers) and strip pre-computed routePoints
    // so the canvas draws simple fallback lines instead of overlapping
    // orthogonal routes.
    const flatLayout = !autoLayout
    const base = getBuilderPreviewCanvasGraph(recipe, {
      flatLayout,
      showEdges,
    })

    if (flatLayout) {
      return {
        ...base,
        edges: base.edges.map((edge) => {
          const { routePoints, labelPoint, ...rest } = edge
          return rest
        }),
      }
    }

    return base
  }, [autoLayout, generationResponse, recipe, showEdges])

  // No remount key. The CanvasStoreProvider is mounted ONCE for the
  // lifetime of this BuilderPreview render. Recipe changes flow into the
  // store via <GraphReconciler />, which preserves editingNodeId,
  // selection, and viewport.
  return (
    <div
      className={cn('h-full w-full overflow-hidden bg-background', className)}
    >
      <CanvasStoreProvider initialGraph={graph}>
        <BuilderPreviewCanvas
          autoLayout={autoLayout}
          exportOpen={exportOpen}
          graph={graph}
          interactionMode={interactionMode}
          layoutAlgorithm={recipe.layoutAlgorithm}
          layoutDirection={recipe.layoutDirection}
          layers={graph.layers}
          nodeCount={graph.nodes.length}
          onCapture={onCapture}
          onCommitNodeText={onCommitNodeText}
          onExportOpenChange={onExportOpenChange}
          onNodeResize={onNodeResize}
          onNodeSelect={onNodeSelect}
          onRegisterFlushInlineEdit={onRegisterFlushInlineEdit}
          onRenameLayer={onRenameLayer}
          onSetLayerTextContent={onSetLayerTextContent}
        />
      </CanvasStoreProvider>
    </div>
  )
}
