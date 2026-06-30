import { ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'
import { TemplatePreviewCanvas } from '@/features/home/TemplatePreviewCanvas'
import type { HomeTemplatePreview } from '@/features/home/types'
import { PromotionBadge } from './PromotionBadge'

interface TemplateCardProps {
  template: HomeTemplatePreview
  large?: boolean
  onClick?: () => void
  className?: string
}

export function TemplateCard({
  template,
  large,
  onClick,
  className,
}: TemplateCardProps) {
  const { t } = useTranslation()

  return (
    <button
      type="button"
      className={cn(
        'group flex cursor-pointer flex-col overflow-hidden rounded-[10px] border border-border bg-card text-left text-card-foreground transition-all duration-150',
        'hover:border-muted-foreground/45',
        large && 'grid grid-rows-[220px_auto] border-border',
        className,
      )}
      onClick={onClick}
    >
      <div className="relative border-b border-border bg-muted">
        <TemplatePreviewCanvas
          template={template}
          variant={large ? 'spotlight' : 'card'}
          className={cn(large ? 'h-[220px]' : 'h-[100px]')}
        />
      </div>
      <div
        className={cn(
          'flex flex-col gap-1.5',
          large ? 'gap-2 px-[22px] py-5' : 'gap-0.5 px-3 py-2',
        )}
      >
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="text-foreground">{template.author}</span>
          <span className="h-3 w-px bg-border" />
          <span>{t('home.count.nodes', { count: template.nodeCount })}</span>
          <span>{t('home.count.edges', { count: template.edgeCount })}</span>
          <PromotionBadge promotion={template.promotion} compact />
        </div>
        <h3
          className={cn(
            'font-semibold tracking-tight',
            large
              ? 'text-[22px] leading-tight break-words'
              : 'truncate text-[14.5px] leading-snug',
          )}
        >
          {template.title}
        </h3>
        {large && (
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            {template.description}
          </p>
        )}
        {large && template.sampleRecordDisplayName && (
          <div className="mt-2">
            <span className="text-[12px] text-muted-foreground">
              {t('home.card.sampleRecord')}
            </span>
            <div className="mt-1.5 inline-flex max-w-full border-l-2 border-brand bg-brand-muted py-0.5 pl-2 pr-2 text-[11.5px] text-brand">
              <span className="truncate">
                {template.sampleRecordDisplayName}
              </span>
            </div>
          </div>
        )}
        <div className="mt-1 inline-flex items-center gap-1.5 self-start text-[12px] font-medium text-brand">
          {large ? t('home.card.reviewLandscape') : t('home.card.details')}
          <span className="ml-1 text-xs text-muted-foreground">
            / {t(`home.status.${template.status}`)}
          </span>
          <ArrowRight className="size-3" />
        </div>
      </div>
    </button>
  )
}
