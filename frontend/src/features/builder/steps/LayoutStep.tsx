import { useTranslation } from 'react-i18next'
import * as R from 'remeda'

import type {
  CanvasGroupLayoutMode,
  CanvasGroupLayoutPolicy,
} from '@/features/canvas/model/types'
import { ELK_ALGORITHMS } from '@/features/elk/algorithms'
import { cn } from '@/lib/utils'
import type { LayoutAlgorithm, RecipeLayoutDirection } from '../types'

const LAYOUT_OPTIONS = R.keys(ELK_ALGORITHMS)
const DIRECTION_OPTIONS: RecipeLayoutDirection[] = ['LR', 'TB', 'RL', 'BT']
const GROUP_LAYOUT_OPTIONS: CanvasGroupLayoutMode[] = ['auto-pack', 'freeform']

interface LayoutStepProps {
  groupLayout: CanvasGroupLayoutPolicy
  groupLayoutEnabled: boolean
  layoutDirection: RecipeLayoutDirection
  selected: LayoutAlgorithm
  onGroupLayoutChange: (layout: CanvasGroupLayoutPolicy) => void
  onLayoutDirectionChange: (direction: RecipeLayoutDirection) => void
  onSelect: (algorithm: LayoutAlgorithm) => void
}

export function LayoutStep({
  groupLayout,
  groupLayoutEnabled,
  layoutDirection,
  selected,
  onGroupLayoutChange,
  onLayoutDirectionChange,
  onSelect,
}: LayoutStepProps) {
  const { t } = useTranslation()
  const selectedGroupMode = groupLayout.mode ?? 'auto-pack'

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <div className="text-[12px] font-medium text-muted-foreground">
          {t('builder.layout.graphLayout')}
        </div>
        {LAYOUT_OPTIONS.map((opt) => (
          <button
            key={opt}
            type="button"
            aria-pressed={opt === selected}
            onClick={() => onSelect(opt)}
            className={cn(
              'flex items-center justify-between rounded-lg border px-3.5 py-2.5 text-[13.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
              opt === selected
                ? 'border-brand/30 bg-brand-muted text-foreground'
                : 'border-border bg-card text-foreground hover:bg-muted',
            )}
          >
            <span>{opt}</span>
            {opt === selected && (
              <span className="font-mono text-[10px] uppercase tracking-wider text-brand">
                {t('builder.layout.selected')}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="text-[12px] font-medium text-muted-foreground">
          {t('builder.layout.direction')}
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {DIRECTION_OPTIONS.map((direction) => (
            <button
              key={direction}
              type="button"
              aria-pressed={direction === layoutDirection}
              onClick={() => onLayoutDirectionChange(direction)}
              className={cn(
                'rounded-lg border px-2 py-2 text-center text-[12.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                direction === layoutDirection
                  ? 'border-brand/30 bg-brand-muted text-foreground'
                  : 'border-border bg-card text-foreground hover:bg-muted',
              )}
            >
              {t(`builder.layout.direction_${direction}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="text-[12px] font-medium text-muted-foreground">
          {t('builder.layout.groupLayout')}
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {GROUP_LAYOUT_OPTIONS.map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={mode === selectedGroupMode}
              disabled={!groupLayoutEnabled}
              onClick={() =>
                onGroupLayoutChange({
                  ...groupLayout,
                  mode,
                })
              }
              className={cn(
                'rounded-lg border px-3 py-2 text-left text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                !groupLayoutEnabled
                  ? 'cursor-not-allowed border-border bg-muted/40 text-muted-foreground/50'
                  : mode === selectedGroupMode
                    ? 'border-brand/30 bg-brand-muted text-foreground'
                    : 'border-border bg-card text-foreground hover:bg-muted',
              )}
            >
              {t(`builder.layout.groupMode_${mode}`)}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
