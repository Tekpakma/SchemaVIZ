import { GripVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { RecipeLayer } from '../types'

interface LayersStepProps {
  layers: RecipeLayer[]
}

export function LayersStep({ layers }: LayersStepProps) {
  return (
    <div className="flex flex-col gap-2">
      {layers.map((layer, i) => (
        <div
          key={layer.id}
          className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2.5"
        >
          <span className="font-mono text-[11px] tracking-wider text-muted-foreground">
            L{i + 1}
          </span>
          <span className="flex-1 text-[13.5px] font-medium">
            {layer.label}
          </span>
          <GripVertical className="size-3.5 text-muted-foreground" />
        </div>
      ))}
      {/* TODO: Wire to addLayer action — open a kind picker from the schema model */}
      <Button variant="ghost" size="sm" className="mt-1 self-start text-[13px] text-brand">
        + Add layer
      </Button>
    </div>
  )
}
