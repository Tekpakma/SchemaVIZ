import { useCallback } from 'react'
import { BoxesIcon, GroupIcon, NetworkIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'
import type { BuilderDocumentActions } from '../builderWorkbench'
import type { CanvasGroupLayoutPolicy } from '@/features/canvas/model/types'
import type {
  GroupMode,
  RecipeGroupRule,
  RecipeModel,
  TraversalEdge,
} from '../types'

interface GroupingStepProps {
  actions: Pick<BuilderDocumentActions, 'addGroupRule' | 'removeGroupRule'>
  edges: TraversalEdge[]
  groupLayout: CanvasGroupLayoutPolicy
  groupRules: RecipeGroupRule[]
  models: RecipeModel[]
}

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

export function GroupingStep({
  actions,
  edges,
  groupLayout,
  groupRules,
  models,
}: GroupingStepProps) {
  const { t } = useTranslation()

  const handleSetMode = useCallback(
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
        ...(nextMode === 'group' ? { layout: groupLayout } : {}),
      })
    },
    [actions, groupLayout, groupRules],
  )

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[12.5px] leading-relaxed text-muted-foreground">
        {t('builder.grouping.description')}
      </p>

      {edges.length === 0 && (
        <p className="py-4 text-center text-[12px] text-muted-foreground">
          {t('builder.grouping.noEdges')}
        </p>
      )}

      {edges.length > 0 && (
        <div className="mt-1 flex flex-col gap-2.5">
          {edges.map((edge) => {
            const mode = getEdgeGroupMode(edge, groupRules)
            return (
              <div
                key={edge.id}
                className="rounded-lg border border-border bg-card px-3 py-2.5"
              >
                {/* Relationship label */}
                <div className="flex items-center gap-1.5 text-[13px]">
                  <span className="font-semibold">
                    {getModelDisplayName(models, edge.fromModelId ?? edge.from)}
                  </span>
                  <span className="text-muted-foreground">→</span>
                  <span className="font-medium text-muted-foreground">
                    {getModelDisplayName(models, edge.toModelId ?? edge.to)}
                  </span>
                </div>
                <div className="mt-0.5 font-mono text-[10px] text-muted-foreground/70">
                  {edge.via}
                </div>

                {/* Segmented control */}
                <div className="mt-2 inline-flex items-center gap-0.5 rounded-lg bg-muted/60 p-0.5">
                  {GROUP_MODES.map((m) => (
                    <ModeSegment
                      key={m}
                      active={mode === m}
                      label={t(`builder.grouping.mode_${m}`)}
                      mode={m}
                      onClick={() => handleSetMode(edge, m)}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="mt-1 flex items-start gap-1.5 text-[11px] text-muted-foreground">
        <svg
          aria-hidden="true"
          className="mt-0.5 shrink-0"
          fill="none"
          height="11"
          viewBox="0 0 12 12"
          width="11"
        >
          <circle
            cx="6"
            cy="6"
            r="4.6"
            stroke="currentColor"
            strokeWidth="1.2"
          />
          <path
            d="M6 5.5v2.5M6 3.6v.2"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.4"
          />
        </svg>
        {t('builder.grouping.hint')}
      </div>
    </div>
  )
}
