import { lazy, Suspense } from 'react'
import { AlertCircle, Database, Wand2 } from 'lucide-react'

import { MiniDiagram } from '@/components/MiniDiagram'
import { cn } from '@/lib/utils'
import type { HomeTemplatePreview } from './types'

type TemplatePreviewCanvasVariant = 'card' | 'spotlight' | 'thumb'

const BuilderPreview = lazy(async () => {
  const module = await import('@/features/builder/BuilderPreview')
  return { default: module.BuilderPreview }
})

interface TemplatePreviewCanvasProps {
  className?: string
  template: HomeTemplatePreview
  variant?: TemplatePreviewCanvasVariant
}

function hasRenderableGraph(template: HomeTemplatePreview) {
  return (
    template.recipe.models.length > 0 ||
    (template.generationResponse?.result.nodes?.length ?? 0) > 0
  )
}

function PreviewStatusOverlay({ template }: { template: HomeTemplatePreview }) {
  if (template.status === 'ready') return null

  const Icon = template.status === 'no_record' ? Database : AlertCircle
  const tone =
    template.status === 'no_record'
      ? 'bg-card/92 text-muted-foreground'
      : 'bg-destructive/10 text-destructive'

  return (
    <div
      className={cn(
        'absolute right-2 top-2 inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-1 text-[11px] shadow-sm backdrop-blur',
        tone,
      )}
    >
      <Icon className="size-3" />
      <span>{template.statusLabel}</span>
    </div>
  )
}

export function TemplatePreviewCanvas({
  className,
  template,
  variant = 'card',
}: TemplatePreviewCanvasProps) {
  const renderCanvas = hasRenderableGraph(template)
  const diagramSeed = template.id.length + template.nodeCount

  return (
    <div
      className={cn(
        'relative h-full w-full overflow-hidden bg-muted',
        variant === 'thumb' && 'rounded-lg',
        className,
      )}
    >
      {renderCanvas ? (
        <div className="pointer-events-none absolute inset-0">
          <Suspense
            fallback={
              <MiniDiagram
                hue={template.hue}
                nodeCount={template.nodeCount || 6}
                edgeCount={template.edgeCount || 6}
                seed={diagramSeed}
                className="h-full w-full"
              />
            }
          >
            <BuilderPreview
              generationResponse={template.generationResponse ?? undefined}
              interactionMode="static"
              recipe={template.recipe}
            />
          </Suspense>
        </div>
      ) : (
        <MiniDiagram
          hue={template.hue}
          nodeCount={template.nodeCount || 6}
          edgeCount={template.edgeCount || 6}
          seed={diagramSeed}
          className="h-full w-full"
        />
      )}

      {variant !== 'thumb' ? (
        <>
          <div className="absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-full border border-border bg-card/92 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground shadow-sm backdrop-blur">
            <Wand2 className="size-3" />
            <span>{template.sourceLabel}</span>
          </div>
          <PreviewStatusOverlay template={template} />
        </>
      ) : null}
    </div>
  )
}
