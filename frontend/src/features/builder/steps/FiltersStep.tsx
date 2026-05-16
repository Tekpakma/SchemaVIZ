import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { RecipeFilter } from '../types'

interface FiltersStepProps {
  filters: RecipeFilter[]
}

export function FiltersStep({ filters }: FiltersStepProps) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[12.5px] leading-relaxed text-muted-foreground">
        {t('builder.filters.descriptionPrefix')}{' '}
        <code className="text-[11px]">start.*</code>{' '}
        {t('builder.filters.descriptionSuffix')}
      </p>
      <div className="mt-1 flex flex-col gap-1.5">
        {filters.map((f) => (
          <div
            key={f.id}
            className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2"
          >
            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {f.layer}
            </span>
            <code className="min-w-0 flex-1 truncate text-[12px]">
              {f.expr}
            </code>
            {f.suggested ? (
              <span className="shrink-0 rounded-full bg-chart-2/15 px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-wider text-chart-2">
                {t('builder.filters.suggestedBadge')}
              </span>
            ) : (
              // TODO: Wire to removeFilter action
              <button
                type="button"
                className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={t('builder.filters.removeFilter')}
                title={t('builder.filters.removeFilter')}
              >
                <X className="size-3" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* TODO: Wire to addFilter action — parse expression and validate against model */}
      <div className="mt-2 flex items-center gap-2">
        <Input
          className="h-8 flex-1 font-mono text-[12px]"
          placeholder="layer.field__op = value"
        />
        <Button variant="outline" size="sm" className="h-8 text-[12px]">
          {t('builder.filters.addFilter')}
        </Button>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <span className="font-mono opacity-60">
          {t('builder.filters.examplesLabel')}
        </span>
        <code className="text-[10.5px]">region__in = start.regions</code>
        <code className="text-[10.5px]">status != 'archived'</code>
      </div>
    </div>
  )
}
