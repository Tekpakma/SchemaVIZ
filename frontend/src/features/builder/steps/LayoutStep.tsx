import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import * as R from 'remeda'
import { BoxesIcon, GroupIcon, NetworkIcon } from 'lucide-react'

import type { CanvasGroupLayoutMode } from '@/features/canvas/model/types'
import { ELK_ALGORITHMS } from '@/features/elk/algorithms'
import { cn } from '@/lib/utils'
import type { BuilderDocumentActions } from '../builderWorkbench'
import {
  DEFAULT_RECIPE_GROUP_LAYOUT,
  type GroupMode,
  type LayoutAlgorithm,
  type RecipeGroupRule,
  type RecipeLayoutDirection,
  type RecipeModel,
  type TraversalEdge,
} from '../types'

const LAYOUT_OPTIONS = R.keys(ELK_ALGORITHMS)
const DIRECTION_OPTIONS: RecipeLayoutDirection[] = ['LR', 'TB', 'RL', 'BT']
const GROUP_LAYOUT_OPTIONS: CanvasGroupLayoutMode[] = ['auto-pack', 'freeform']
const GROUP_MODES: GroupMode[] = ['none', 'group', 'breakout']

/** Algorithms that use elk.direction + fixed-side port routing. */
const DIRECTIONAL_ALGORITHMS = new Set<LayoutAlgorithm>(['Layered', 'Tree'])

// ---------------------------------------------------------------------------
// Grouping helpers (merged from GroupingStep)
// ---------------------------------------------------------------------------

function getModelDisplayName(models: RecipeModel[], modelId: string) {
  return (
    models.find((m) => m.modelId === modelId)?.displayName ??
    models.find((m) => m.id === modelId)?.displayName ??
    modelId
  )
}

function getEdgeGroupMode(
  edge: TraversalEdge,
  groupRules: RecipeGroupRule[],
): GroupMode {
  const rule = groupRules.find(
    (r) =>
      r.parentModelId === (edge.fromModelId ?? edge.from) &&
      r.childModelId === (edge.toModelId ?? edge.to) &&
      r.via === edge.via,
  )
  return rule?.mode ?? 'none'
}

function findGroupRuleForEdge(
  edge: TraversalEdge,
  groupRules: RecipeGroupRule[],
): RecipeGroupRule | undefined {
  return groupRules.find(
    (r) =>
      r.parentModelId === (edge.fromModelId ?? edge.from) &&
      r.childModelId === (edge.toModelId ?? edge.to) &&
      r.via === edge.via,
  )
}

function getModeIcon(mode: GroupMode) {
  switch (mode) {
    case 'group':
      return <GroupIcon className="size-3" aria-hidden="true" />
    case 'breakout':
      return <BoxesIcon className="size-3" aria-hidden="true" />
    default:
      return <NetworkIcon className="size-3" aria-hidden="true" />
  }
}

function ModeSegment({
  active,
  label,
  mode,
  onClick,
}: {
  active: boolean
  label: string
  mode: GroupMode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'flex items-center gap-1 rounded-md px-2 py-1 text-[10.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        active && mode === 'group'
          ? 'bg-brand text-brand-foreground shadow-sm'
          : active && mode === 'breakout'
            ? 'bg-amber-500 text-white shadow-sm'
            : active
              ? 'bg-foreground text-background shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {getModeIcon(mode)}
      {label}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Layout step (algorithm + direction + grouping)
// ---------------------------------------------------------------------------

interface LayoutStepProps {
  actions: Pick<BuilderDocumentActions, 'addGroupRule' | 'removeGroupRule'>
  edges: TraversalEdge[]
  groupRules: RecipeGroupRule[]
  layoutDirection: RecipeLayoutDirection
  models: RecipeModel[]
  selected: LayoutAlgorithm
  onLayoutDirectionChange: (direction: RecipeLayoutDirection) => void
  onSelect: (algorithm: LayoutAlgorithm) => void
}

export function LayoutStep({
  actions,
  edges,
  groupRules,
  layoutDirection,
  models,
  selected,
  onLayoutDirectionChange,
  onSelect,
}: LayoutStepProps) {
  const { t } = useTranslation()
  const directionEnabled = DIRECTIONAL_ALGORITHMS.has(selected)

  const handleSetGroupMode = useCallback(
    (edge: TraversalEdge, nextMode: GroupMode) => {
      const existing = findGroupRuleForEdge(edge, groupRules)

      if (nextMode === 'none') {
        if (existing) actions.removeGroupRule(existing.id)
        return
      }

      if (existing) {
        actions.removeGroupRule(existing.id)
      }

      actions.addGroupRule({
        id: existing?.id ?? `grp-${edge.id}`,
        parentModelId: edge.fromModelId ?? edge.from,
        childModelId: edge.toModelId ?? edge.to,
        via: edge.via,
        mode: nextMode,
        ...(nextMode === 'group'
          ? { layout: existing?.layout ?? DEFAULT_RECIPE_GROUP_LAYOUT }
          : {}),
      })
    },
    [actions, groupRules],
  )

  const handleSetGroupRuleLayout = useCallback(
    (edge: TraversalEdge, layoutMode: CanvasGroupLayoutMode) => {
      const existing = findGroupRuleForEdge(edge, groupRules)
      if (!existing || existing.mode !== 'group') return

      actions.removeGroupRule(existing.id)
      actions.addGroupRule({
        ...existing,
        layout: { ...existing.layout, mode: layoutMode },
      })
    },
    [actions, groupRules],
  )

  return (
    <div className="flex flex-col gap-4">
      {/* Algorithm picker */}
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

      {/* Direction picker */}
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
              disabled={!directionEnabled}
              onClick={() => onLayoutDirectionChange(direction)}
              className={cn(
                'rounded-lg border px-2 py-2 text-center text-[12.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                !directionEnabled
                  ? 'cursor-not-allowed border-border bg-muted/40 text-muted-foreground/50'
                  : direction === layoutDirection
                    ? 'border-brand/30 bg-brand-muted text-foreground'
                    : 'border-border bg-card text-foreground hover:bg-muted',
              )}
            >
              {t(`builder.layout.direction_${direction}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Grouping rules */}
      {edges.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="text-[12px] font-medium text-muted-foreground">
            {t('builder.layout.grouping')}
          </div>
          <div className="flex flex-col gap-2">
            {edges.map((edge) => {
              const mode = getEdgeGroupMode(edge, groupRules)
              const ruleLayout =
                findGroupRuleForEdge(edge, groupRules)?.layout?.mode ??
                'auto-pack'
              return (
                <div
                  key={edge.id}
                  className="rounded-lg border border-border bg-card px-3 py-2.5"
                >
                  <div className="flex items-center gap-1.5 text-[13px]">
                    <span className="font-semibold">
                      {getModelDisplayName(
                        models,
                        edge.fromModelId ?? edge.from,
                      )}
                    </span>
                    <span className="text-muted-foreground">→</span>
                    <span className="font-medium text-muted-foreground">
                      {getModelDisplayName(
                        models,
                        edge.toModelId ?? edge.to,
                      )}
                    </span>
                  </div>
                  <div className="mt-0.5 font-mono text-[10px] text-muted-foreground/70">
                    {edge.via}
                  </div>
                  <div className="mt-2 inline-flex items-center gap-0.5 rounded-lg bg-muted/60 p-0.5">
                    {GROUP_MODES.map((m) => (
                      <ModeSegment
                        key={m}
                        active={mode === m}
                        label={t(`builder.grouping.mode_${m}`)}
                        mode={m}
                        onClick={() => handleSetGroupMode(edge, m)}
                      />
                    ))}
                  </div>
                  {/* Inline group layout picker — only shown for grouped edges */}
                  {mode === 'group' && (
                    <div className="mt-2 grid grid-cols-2 gap-1">
                      {GROUP_LAYOUT_OPTIONS.map((layoutMode) => (
                        <button
                          key={layoutMode}
                          type="button"
                          aria-pressed={layoutMode === ruleLayout}
                          onClick={() =>
                            handleSetGroupRuleLayout(edge, layoutMode)
                          }
                          className={cn(
                            'rounded-md border px-2 py-1.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                            layoutMode === ruleLayout
                              ? 'border-brand/30 bg-brand-muted text-foreground'
                              : 'border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground',
                          )}
                        >
                          {t(`builder.layout.groupMode_${layoutMode}`)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
