import { ArrowRight } from 'lucide-react'

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
  return (
    <button
      type="button"
      className={cn(
        'group flex cursor-pointer flex-col overflow-hidden rounded-[14px] border border-border bg-card text-left text-card-foreground transition-all duration-150',
        'hover:-translate-y-0.5 hover:border-muted-foreground/45 hover:shadow-[0_18px_40px_rgba(0,0,0,0.08),0_2px_6px_rgba(0,0,0,0.04)]',
        large &&
          'grid grid-rows-[220px_auto] border-border shadow-[0_22px_60px_rgba(0,0,0,0.10)]',
        className,
      )}
      onClick={onClick}
    >
      <div className="relative border-b border-border bg-muted">
        <TemplatePreviewCanvas
          template={template}
          variant={large ? 'spotlight' : 'card'}
          className={cn(large ? 'h-[220px]' : 'h-[116px]')}
        />
      </div>
      <div
        className={cn(
          'flex flex-col gap-1.5',
          large ? 'gap-2 px-[22px] py-5' : 'px-4 py-3.5',
        )}
      >
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span
            className="size-[7px] rounded-full"
            style={{ background: template.accent }}
          />
          <span className="text-foreground">{template.author}</span>
          <span className="text-border">·</span>
          <span className="font-mono text-[11px]">
            {template.nodeCount} nodes
          </span>
          <span className="font-mono text-[11px]">
            {template.edgeCount} edges
          </span>
          <PromotionBadge promotion={template.promotion} compact />
        </div>
        <h3
          className={cn(
            'font-semibold tracking-tight',
            large ? 'text-[22px] leading-tight' : 'text-[14.5px] leading-snug',
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
            <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-muted-foreground">
              SAMPLE RECORD
            </span>
            <div className="mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded-full bg-brand-muted px-2 py-0.5 text-[11.5px] text-brand">
              <span className="size-[5px] rounded-full bg-brand" />
              <span className="truncate">
                {template.sampleRecordDisplayName}
              </span>
            </div>
          </div>
        )}
        <div className="mt-2.5 inline-flex items-center gap-1.5 self-start text-[13px] font-medium text-brand">
          {large ? 'View landscape' : 'Open'}
          <span className="ml-1 text-xs text-muted-foreground">
            · {template.statusLabel}
          </span>
          <ArrowRight className="size-3" />
        </div>
      </div>
    </button>
  )
}
