import { createFileRoute } from '@tanstack/react-router'
import {
  Download,
  Hand,
  MousePointer2,
  PenLine,
  Shapes,
  Type,
} from 'lucide-react'
import * as zod from 'zod'

import { Button } from '@/components/ui/button'

const freedrawSearchSchema = zod.object({
  drawingId: zod.string().optional(),
})

export const Route = createFileRoute('/_app/freedraw')({
  validateSearch: freedrawSearchSchema,
  ssr: false,
  component: FreedrawRoute,
})

function FreedrawRoute() {
  const { drawingId } = Route.useSearch()

  return (
    <section className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex min-h-12 items-center gap-2 border-b border-border px-3">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold">Freedraw</h1>
          <p className="truncate text-xs text-muted-foreground">
            {drawingId ? `Drawing ${drawingId}` : 'Untitled canvas'}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" aria-label="Select">
            <MousePointer2 className="size-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Pan">
            <Hand className="size-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Draw">
            <PenLine className="size-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Text">
            <Type className="size-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Shapes">
            <Shapes className="size-4" />
          </Button>
          <Button variant="outline" size="sm" className="hidden sm:inline-flex">
            <Download className="size-4" />
            Export
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1fr_280px]">
        <main className="relative min-h-0 overflow-hidden bg-[color-mix(in_srgb,var(--muted)_35%,transparent)]">
          <div className="absolute left-3 top-3 flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground">
            100%
          </div>
          <div className="grid h-full place-items-center p-6">
            <div className="aspect-[16/10] w-full max-w-5xl border border-border bg-background shadow-sm" />
          </div>
        </main>

        <aside className="min-h-0 border-t border-border bg-background p-3 lg:border-l lg:border-t-0">
          <h2 className="text-sm font-semibold">Inspector</h2>
          <div className="mt-3 space-y-3 text-xs text-muted-foreground">
            <div className="rounded-md border border-border p-3">
              No selection
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="sm">
                Align
              </Button>
              <Button variant="outline" size="sm">
                Style
              </Button>
            </div>
          </div>
        </aside>
      </div>
    </section>
  )
}
