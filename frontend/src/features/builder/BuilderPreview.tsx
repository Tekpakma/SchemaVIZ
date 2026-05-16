import { useEffect, useMemo, useRef } from 'react'
import { useServerFn } from '@tanstack/react-start'

import { CanvasSurface } from '@/features/canvas/components/CanvasSurface'
import { getCanvasFitViewportForFrames } from '@/features/canvas/fitView'
import { CanvasHelperLinesProvider } from '@/features/canvas/hooks/useCanvasHelperLines'
import { layoutCanvasGraph } from '@/features/canvas/layout.functions'
import { ELK_BUILDER_PREVIEW } from '@/features/elk/algorithms'
import { cn } from '@/lib/utils'
import {
  CanvasStoreProvider,
  useCanvasActions,
  useCanvasSnapshotGetters,
} from '@/store/canvasStore'
import {
  BUILDER_PREVIEW_STAGE_HEIGHT,
  BUILDER_PREVIEW_STAGE_WIDTH,
  getBuilderPreviewCanvasGraph,
} from './builderPreviewLayout'
import { getGenerationPreviewCanvasGraph } from './generationPreviewGraph'
import type { GenerationRunResult } from './generationPreviewQuery'
import type { RecipeData } from './types'

const BUILDER_PREVIEW_FIT_WORLD = {
  width: BUILDER_PREVIEW_STAGE_WIDTH,
  height: BUILDER_PREVIEW_STAGE_HEIGHT,
}

// ---------------------------------------------------------------------------
// Auto-layout: runs ELK to position all nodes (compound groups + children)
// ---------------------------------------------------------------------------

function BuilderPreviewAutoLayout({ nodeCount }: { nodeCount: number }) {
  const { applyGraphLayout, setViewport } = useCanvasActions()
  const { getActiveCanvasTabIdSnapshot, getCanvasLayoutSnapshot } =
    useCanvasSnapshotGetters()
  const runLayout = useServerFn(layoutCanvasGraph)
  const inflightRef = useRef(false)

  useEffect(() => {
    if (nodeCount === 0 || inflightRef.current) return

    inflightRef.current = true

    const tabId = getActiveCanvasTabIdSnapshot()
    const snapshot = getCanvasLayoutSnapshot(tabId)

    runLayout({
      data: {
        ...snapshot,
        layoutOptions: ELK_BUILDER_PREVIEW,
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
    nodeCount,
    applyGraphLayout,
    setViewport,
    getActiveCanvasTabIdSnapshot,
    getCanvasLayoutSnapshot,
    runLayout,
  ])

  return null
}

// ---------------------------------------------------------------------------
// Canvas surface wrapper
// ---------------------------------------------------------------------------

function BuilderPreviewCanvas({ nodeCount }: { nodeCount: number }) {
  return (
    <CanvasHelperLinesProvider>
      <BuilderPreviewAutoLayout nodeCount={nodeCount} />
      <CanvasSurface
        fitWorld={BUILDER_PREVIEW_FIT_WORLD}
        interactionMode="viewport"
        seedDefaultNode={false}
        showChrome
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
  generationResult,
  recipe,
  showEdges = true,
}: {
  className?: string
  generationResult?: GenerationRunResult
  recipe: RecipeData
  showEdges?: boolean
}) {
  const graph = useMemo(
    () =>
      generationResult
        ? getGenerationPreviewCanvasGraph(generationResult)
        : getBuilderPreviewCanvasGraph(recipe, { showEdges }),
    [generationResult, recipe, showEdges],
  )

  return (
    <div
      className={cn('h-full w-full overflow-hidden bg-background', className)}
    >
      <CanvasStoreProvider key={graph.key} initialGraph={graph}>
        <BuilderPreviewCanvas nodeCount={graph.nodes.length} />
      </CanvasStoreProvider>
    </div>
  )
}
