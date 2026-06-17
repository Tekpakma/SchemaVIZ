import { ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { PromotionBadge } from '@/components/PromotionBadge'
import { TemplatePreviewCanvas } from './TemplatePreviewCanvas'
import type { HomeTemplatePreview } from './types'

interface PromotedRowProps {
  templates: HomeTemplatePreview[]
  onOpen: (template: HomeTemplatePreview) => void
}

export function PromotedRow({ templates, onOpen }: PromotedRowProps) {
  const { t } = useTranslation()
  const promoted = templates.filter(
    (template) => template.source === 'featured',
  )
  if (promoted.length === 0) return null

  const featured = promoted[0]!
  const rest = promoted.slice(1, 4)

  return (
    <section className="border-t border-border pb-4 pt-7 text-foreground">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">
            {t('home.promoted.title')}
          </h2>
        </div>
        <span className="text-[12.5px] text-muted-foreground">
          {t('home.count.featured', { count: promoted.length })}
        </span>
      </div>

      <div className="grid grid-cols-[1.4fr_1fr] gap-4">
        <button
          type="button"
          className="group grid min-h-[220px] cursor-pointer grid-cols-2 overflow-hidden rounded-[10px] border border-border bg-card text-left text-card-foreground transition-colors duration-150 hover:border-muted-foreground/45"
          onClick={() => onOpen(featured)}
        >
          <div className="border-r border-border bg-muted">
            <TemplatePreviewCanvas
              template={featured}
              variant="spotlight"
              className="h-full min-h-[220px]"
            />
          </div>
          <div className="flex flex-col gap-2 px-5 py-[18px]">
            <PromotionBadge promotion={featured.promotion} />
            <h3 className="mt-1 text-lg font-semibold tracking-tight">
              {featured.title}
            </h3>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              {featured.description}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>
                {t('home.detail.author')}{' '}
                <span className="font-semibold text-foreground">
                  {featured.author}
                </span>
              </span>
              <span className="h-3 w-px bg-border" />
              <span>
                {t('home.count.nodes', { count: featured.nodeCount })}
              </span>
              <span className="h-3 w-px bg-border" />
              <span>
                {t('home.count.edges', { count: featured.edgeCount })}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="inline-flex items-center rounded-[6px] bg-muted px-2 py-0.5 text-[11.5px] text-muted-foreground">
                {t(`home.status.${featured.status}`)}
              </span>
              {featured.sampleRecordDisplayName ? (
                <span className="inline-flex max-w-[220px] items-center border-l-2 border-brand bg-brand-muted py-0.5 pl-2 pr-2 text-[11.5px] text-brand">
                  <span className="truncate">
                    {featured.sampleRecordDisplayName}
                  </span>
                </span>
              ) : null}
            </div>
          </div>
        </button>

        <div className="flex flex-col gap-2">
          {rest.map((template) => (
            <button
              key={template.id}
              type="button"
              className="group/item grid cursor-pointer grid-cols-[72px_1fr_auto] items-center gap-3 rounded-[10px] border border-border bg-card px-3.5 py-2.5 text-left text-card-foreground transition-colors duration-100 hover:border-muted-foreground/45"
              onClick={() => onOpen(template)}
            >
              <div className="h-12 overflow-hidden rounded-lg border border-border bg-muted">
                <TemplatePreviewCanvas
                  template={template}
                  variant="thumb"
                  className="size-full"
                />
              </div>
              <div className="flex min-w-0 flex-col gap-0.5">
                <PromotionBadge promotion={template.promotion} compact />
                <h4 className="mt-0.5 text-[13.5px] font-semibold tracking-tight">
                  {template.title}
                </h4>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>
                    {t('home.detail.author')} {template.author}
                  </span>
                  <span className="h-3 w-px bg-border" />
                  <span>{t(`home.status.${template.status}`)}</span>
                </div>
              </div>
              <ArrowRight className="size-3 text-muted-foreground transition-colors group-hover/item:text-brand" />
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
