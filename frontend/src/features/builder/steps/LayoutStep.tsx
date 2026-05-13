import { cn } from '@/lib/utils'
import type { LayoutAlgorithm } from '../types'

import { ELK_ALGORITHMS } from '@/features/elk/algorithms'
import * as R from "remeda"
const LAYOUT_OPTIONS = R.keys(ELK_ALGORITHMS)

interface LayoutStepProps {
  selected: LayoutAlgorithm
  onSelect: (algorithm: LayoutAlgorithm) => void
}

export function LayoutStep({ selected, onSelect }: LayoutStepProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {/* TODO: Wire to backend layout engine — each option maps to an ELK/dagre config */}
      {LAYOUT_OPTIONS.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onSelect(opt)}
          className={cn(
            'flex items-center justify-between rounded-lg border px-3.5 py-2.5 text-[13.5px] font-medium transition-colors',
            opt === selected
              ? 'border-brand/30 bg-brand-muted text-foreground'
              : 'border-border bg-card text-foreground hover:bg-muted',
          )}
        >
          <span>{opt}</span>
          {opt === selected && (
            <span className="font-mono text-[10px] uppercase tracking-wider text-brand">
              selected
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
