import { cn } from '@/lib/utils'
import { AlertTriangle } from 'lucide-react'
import type { TraversalEdge } from '../types'

interface TraversalStepProps {
  edges: TraversalEdge[]
}

function EdgeArrow({ auto }: { auto: boolean }) {
  return (
    <svg width="36" height="14" viewBox="0 0 36 14" className="shrink-0">
      <path
        d="M2 7h28m0 0l-4-3m4 3l-4 3"
        stroke={auto ? 'var(--chart-2)' : 'var(--muted-foreground)'}
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={auto ? '' : '3 3'}
      />
    </svg>
  )
}

export function TraversalStep({ edges }: TraversalStepProps) {
  const ambiguousCount = edges.filter((e) => !e.auto).length

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[12.5px] leading-relaxed text-muted-foreground">
        Auto-pathfinding walks the model. When multiple paths exist, you'll pick
        one.
      </p>
      <div className="mt-1 flex flex-col gap-1.5">
        {edges.map((edge) => (
          <div
            key={edge.id}
            className={cn(
              'flex items-center gap-2 rounded-lg border px-3 py-2.5',
              edge.alt
                ? 'border-dashed border-muted-foreground/30 bg-muted/50'
                : 'border-border bg-card',
            )}
          >
            <span className="text-[12.5px] font-medium">{edge.from}</span>
            <EdgeArrow auto={edge.auto} />
            <span className="text-[12.5px] font-medium">{edge.to}</span>
            <span
              className="ml-auto font-mono text-[11px] text-muted-foreground"
              title={`cost ${edge.cost}`}
            >
              {edge.via}
            </span>
            {edge.auto ? (
              <span className="rounded-full bg-chart-2/15 px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-wider text-chart-2">
                auto
              </span>
            ) : (
              // TODO: Wire to edge path picker — let user choose which path
              <span className="rounded-full bg-destructive/10 px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-wider text-destructive">
                needs pick
              </span>
            )}
          </div>
        ))}
      </div>
      {ambiguousCount > 0 && (
        <div className="mt-2 flex items-center gap-2 text-[12px] text-muted-foreground">
          <AlertTriangle className="size-3.5" />
          {ambiguousCount} ambiguous edge{ambiguousCount > 1 ? 's' : ''} — pick
          the path you want.
        </div>
      )}
    </div>
  )
}
