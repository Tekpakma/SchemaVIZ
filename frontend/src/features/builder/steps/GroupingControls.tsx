import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { BoxesIcon, GroupIcon, NetworkIcon } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { BuilderDocumentActions } from '../builderWorkbench'
import { DEFAULT_RECIPE_GROUP_LAYOUT } from '../types'
import type {
  GroupMode,
  RecipeGroupRule,
  RecipeModel,
  TraversalEdge,
} from '../types'

const GROUP_MODES: GroupMode[] = ['none', 'group', 'breakout']

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

export function GroupingControls({
  actions,
  edges,
  groupRules,
  models,
}: {
  actions: Pick<BuilderDocumentActions, 'addGroupRule' | 'removeGroupRule'>
  edges: TraversalEdge[]
  groupRules: RecipeGroupRule[]
  models: RecipeModel[]
}) {
  const { t } = useTranslation()

  const handleSetGroupMode = useCallback(
    (edge: TraversalEdge, nextMode: GroupMode) => {
      const existing = groupRules.find(
        (r) =>
          r.parentModelId === (edge.fromModelId ?? edge.from) &&
          r.childModelId === (edge.toModelId ?? edge.to) &&
          r.via === edge.via,
      )

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

  if (edges.length === 0) return null

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="text-[12px] font-medium text-muted-foreground">
        {t('builder.layout.grouping')}
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        {edges.map((edge) => {
          const mode = getEdgeGroupMode(edge, groupRules)
          return (
            <div
              key={edge.id}
              className="min-w-0 rounded-lg border border-border bg-card px-3 py-2.5"
            >
              <div className="flex min-w-0 items-center gap-1.5 text-[13px]">
                <span className="min-w-0 truncate font-semibold">
                  {getModelDisplayName(models, edge.fromModelId ?? edge.from)}
                </span>
                <span className="shrink-0 text-muted-foreground">→</span>
                <span className="min-w-0 truncate font-medium text-muted-foreground">
                  {getModelDisplayName(models, edge.toModelId ?? edge.to)}
                </span>
              </div>
              <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground/70">
                {edge.via}
              </div>
              <div className="mt-2 inline-flex max-w-full items-center gap-0.5 rounded-lg bg-muted/60 p-0.5">
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
            </div>
          )
        })}
      </div>
    </div>
  )
}
