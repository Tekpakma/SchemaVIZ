import { useEffect, useMemo, useRef } from 'react'
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
import { getGenerationPreviewCanvasGraph } from './generationPreviewGraph'
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

function BuilderPreviewLayerScaffold({
  layers,
}: {
  layers: BuilderPreviewCanvasLayer[]
}) {
  const nodes = useCanvasNodes()
  const { resolvedTheme } = useTheme()
  const labelFill =
    resolvedTheme === 'dark'
      ? 'rgba(244, 244, 245, 0.46)'
      : 'rgba(113, 113, 122, 0.64)'

  return (
    <>
      {layers.map((layer) => {
        const bounds = getLayerBounds(layer, nodes)
        if (!bounds) return null

        const columnWidth = Math.max(
          LAYER_LABEL_MIN_WIDTH,
          bounds.maxX - bounds.minX,
        )
        const x = bounds.minX + (bounds.maxX - bounds.minX - columnWidth) / 2
        const y = Math.max(4, bounds.minY - LAYER_LABEL_TOP_GAP)

        return (
          <KonvaText
            key={layer.id}
            align="center"
            fill={labelFill}
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            fontSize={11}
            fontStyle="bold"
            letterSpacing={3}
            listening={false}
            text={layer.label}
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
  nodeCount,
}: {
  layoutAlgorithm: RecipeData['layoutAlgorithm']
  layoutDirection: RecipeData['layoutDirection']
  layoutKey: string
  nodeCount: number
}) {
  const { applyGraphLayout, setViewport } = useCanvasActions()
  const { getActiveCanvasTabIdSnapshot, getCanvasLayoutSnapshot } =
    useCanvasSnapshotGetters()
  const runLayout = useServerFn(layoutCanvasGraph)
  const inflightRef = useRef(false)
  const layoutOptions = useMemo(
    () => getBuilderPreviewLayoutOptions(layoutAlgorithm),
    [layoutAlgorithm],
  )
  const flowDirection = getBuilderPreviewFlowDirection(layoutDirection)

  useEffect(() => {
    if (nodeCount === 0 || inflightRef.current) return

    inflightRef.current = true

    const tabId = getActiveCanvasTabIdSnapshot()
    const snapshot = getCanvasLayoutSnapshot(tabId)

    runLayout({
      data: {
        ...snapshot,
        flowDirection,
        layoutOptions,
      },
    })
      .then((result) => {
        applyGraphLayout(result, { tabId })

        const nextViewport = getCanvasFitViewportForFrames(
          result.nodeFrames,
          BUILDER_PREVIEW_FIT_WORLD,
        )
        if (nextViewport) {
          setViewport(nextViewport, { tabId })
        }
      })
      .finally(() => {
        inflightRef.current = false
      })
  }, [
    layoutKey,
    nodeCount,
    flowDirection,
    layoutOptions,
    applyGraphLayout,
    setViewport,
    getActiveCanvasTabIdSnapshot,
    getCanvasLayoutSnapshot,
    runLayout,
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
  interactionMode,
  layers,
  nodeCount,
  onCommitNodeText,
  onNodeResize,
  onNodeSelect,
}: {
  graph: { nodes: CanvasNode[]; edges: CanvasEdge[] }
  layoutAlgorithm: RecipeData['layoutAlgorithm']
  layoutDirection: RecipeData['layoutDirection']
  autoLayout: boolean
  interactionMode: 'edit' | 'viewport' | 'static'
  layers: BuilderPreviewCanvasLayer[]
  nodeCount: number
  onCommitNodeText?: (commit: BuilderPreviewCommit) => void
  onNodeResize?: (resize: BuilderPreviewResize) => void
  onNodeSelect?: (nodeId: string | null) => void
}) {
  const fitWorld = useMemo(() => getGraphFitWorld(graph.nodes), [graph.nodes])

  return (
    <CanvasHelperLinesProvider>
      <GraphReconciler graph={graph} preserveGeometry={autoLayout} />
      {autoLayout ? (
        <BuilderPreviewAutoLayout
          layoutAlgorithm={layoutAlgorithm}
          layoutDirection={layoutDirection}
          layoutKey={graph.key}
          nodeCount={nodeCount}
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
            <BuilderPreviewLayerScaffold layers={layers} />
          ) : undefined
        }
        fitWorld={fitWorld}
        inlineEditor={<BuilderInlineEditor onCommit={onCommitNodeText} />}
        interactionMode={interactionMode}
        seedDefaultNode={false}
        showChrome
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
  className,
  generationResponse,
  interactionMode = 'viewport',
  onCommitNodeText,
  onNodeResize,
  onNodeSelect,
  recipe,
  showEdges = true,
}: {
  className?: string
  generationResponse?: GenerationRunResponse
  interactionMode?: 'edit' | 'viewport' | 'static'
  onCommitNodeText?: (commit: BuilderPreviewCommit) => void
  onNodeResize?: (resize: BuilderPreviewResize) => void
  onNodeSelect?: (nodeId: string | null) => void
  recipe: RecipeData
  showEdges?: boolean
}) {
  const graph = useMemo(
    () =>
      generationResponse
        ? getGenerationPreviewCanvasGraph(generationResponse, recipe)
        : getBuilderPreviewCanvasGraph(recipe, { showEdges }),
    [generationResponse, recipe, showEdges],
  )
  const autoLayout = true

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
          graph={graph}
          interactionMode={interactionMode}
          layoutAlgorithm={recipe.layoutAlgorithm}
          layoutDirection={recipe.layoutDirection}
          layers={graph.layers}
          nodeCount={graph.nodes.length}
          onCommitNodeText={onCommitNodeText}
          onNodeResize={onNodeResize}
          onNodeSelect={onNodeSelect}
        />
      </CanvasStoreProvider>
    </div>
  )
}
