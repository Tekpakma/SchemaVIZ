import { useMemo } from 'react'

import { CanvasSurface } from '@/features/canvas/components/CanvasSurface'
import { CanvasHelperLinesProvider } from '@/features/canvas/hooks/useCanvasHelperLines'
import { CanvasStoreProvider } from '@/store/canvasStore'
import {
  BUILDER_PREVIEW_STAGE_HEIGHT,
  BUILDER_PREVIEW_STAGE_WIDTH,
  getBuilderPreviewCanvasGraph,
} from './builderPreviewLayout'
import type { BuilderPreviewColumn } from './builderPreviewLayout'
import { BuilderPreviewColumns } from './BuilderPreviewColumns'
import type { RecipeData } from './types'

const BUILDER_PREVIEW_FIT_WORLD = {
  width: BUILDER_PREVIEW_STAGE_WIDTH,
  height: BUILDER_PREVIEW_STAGE_HEIGHT,
}

function BuilderPreviewCanvas({
  columns,
}: {
  columns: BuilderPreviewColumn[]
}) {
  return (
    <CanvasHelperLinesProvider>
      <CanvasSurface
        backgroundLayer={<BuilderPreviewColumns columns={columns} />}
        fitWorld={BUILDER_PREVIEW_FIT_WORLD}
        readOnly
        seedDefaultNode={false}
        showChrome={false}
        showTabBar={false}
      />
    </CanvasHelperLinesProvider>
  )
}

export function BuilderPreview({ recipe }: { recipe: RecipeData }) {
  const graph = useMemo(() => getBuilderPreviewCanvasGraph(recipe), [recipe])

  return (
    <div className="aspect-[960/520] w-full overflow-hidden rounded-lg border border-border bg-background shadow-sm">
      <CanvasStoreProvider key={graph.key} initialGraph={graph}>
        <BuilderPreviewCanvas columns={graph.columns} />
      </CanvasStoreProvider>
    </div>
  )
}
