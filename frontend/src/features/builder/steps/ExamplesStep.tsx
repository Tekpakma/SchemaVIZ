import { MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { ExampleRecord } from '../types'

interface ExamplesStepProps {
  examples: ExampleRecord[]
}

export function ExamplesStep({ examples }: ExamplesStepProps) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[12.5px] leading-relaxed text-muted-foreground">
        Each example becomes a valid <b className="text-foreground">starting record</b> when
        the template is opened.
      </p>
      <div className="mt-1 flex flex-col gap-1.5">
        {examples.map((ex) => (
          <div
            key={ex.id}
            className={cn(
              'flex items-center gap-2.5 rounded-lg border px-3 py-2.5',
              ex.isDefault
                ? 'border-brand/25 bg-brand-muted'
                : 'border-border bg-card',
            )}
          >
            <span
              className={cn(
                'size-2 shrink-0 rounded-full',
                ex.isDefault ? 'bg-brand' : 'bg-muted-foreground/40',
              )}
            />
            <div className="min-w-0 flex-1">
              <span className="text-[13.5px] font-semibold">{ex.label}</span>
              <span className="ml-2 font-mono text-[11px] text-muted-foreground">
                {ex.kind} · <code className="text-[10.5px]">{ex.idValue}</code>
              </span>
            </div>
            {ex.isDefault && (
              <span className="rounded-full bg-brand/15 px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-wider text-brand">
                DEFAULT
              </span>
            )}
            {/* TODO: Wire to context menu — set default, remove, edit */}
            <button
              type="button"
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <MoreHorizontal className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
      {/* TODO: Wire to record picker — search & pin from live data */}
      <Button variant="ghost" size="sm" className="mt-1 self-start text-[13px] text-brand">
        + Pin example record
      </Button>
    </div>
  )
}
