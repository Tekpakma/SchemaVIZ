import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import type { RecipeGroupRule, RecipeModel } from '../types'

interface GroupingStepProps {
  actions: {
    removeGroupRule: (id: string) => void
  }
  groupRules: RecipeGroupRule[]
  models: RecipeModel[]
}

function getModelDisplayName(models: RecipeModel[], modelId: string) {
  return models.find((m) => m.id === modelId)?.displayName ?? modelId
}

export function GroupingStep({ actions, groupRules, models }: GroupingStepProps) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[12.5px] leading-relaxed text-muted-foreground">
        {t('builder.grouping.description')}
      </p>

      <div className="mt-1 flex flex-col gap-2">
        {groupRules.map((rule) => (
          <div
            key={rule.id}
            className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3"
          >
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5">
                <code className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                  {getModelDisplayName(models, rule.parentModelId)}
                </code>
                <svg
                  aria-hidden="true"
                  className="text-muted-foreground"
                  fill="none"
                  height="14"
                  viewBox="0 0 20 14"
                  width="20"
                >
                  <rect
                    height="12"
                    rx="2.5"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    width="18"
                    x="1"
                    y="1"
                  />
                  <rect
                    fill="currentColor"
                    height="5"
                    opacity="0.55"
                    rx="1"
                    width="5"
                    x="4"
                    y="5"
                  />
                  <rect
                    fill="currentColor"
                    height="5"
                    opacity="0.55"
                    rx="1"
                    width="5"
                    x="11"
                    y="5"
                  />
                </svg>
                <code className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                  {getModelDisplayName(models, rule.childModelId)}
                </code>
              </span>
              <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                via <code>{rule.via}</code>
              </span>
              <button
                aria-label={t('builder.grouping.removeRule')}
                className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => actions.removeGroupRule(rule.id)}
                title={t('builder.grouping.removeRule')}
                type="button"
              >
                <X className="size-3" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {groupRules.length === 0 && (
        <p className="py-4 text-center text-[12px] text-muted-foreground">
          {t('builder.grouping.empty')}
        </p>
      )}

      {/* TODO: Wire to addGroupRule action — open model picker for parent/child selection */}
      <Button className="mt-2" size="sm" variant="outline">
        {t('builder.grouping.addRule')}
      </Button>

      <div className="mt-1 flex items-start gap-1.5 text-[11px] text-muted-foreground">
        <svg
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
