import { ArrowRight } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { Template } from '@/features/home/types'
import { MiniDiagram } from './MiniDiagram'
import { PromotionBadge } from './PromotionBadge'

const HUE_COLORS = {
  pink: 'var(--brand)',
  green: 'var(--chart-2)',
  plum: 'var(--chart-5)',
} as const

interface TemplateCardProps {
  template: Template
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
    <article
      className={cn(
        'group flex cursor-pointer flex-col overflow-hidden rounded-[14px] border border-border bg-card text-card-foreground transition-all duration-150',
        'hover:-translate-y-0.5 hover:border-muted-foreground/45 hover:shadow-[0_18px_40px_rgba(0,0,0,0.08),0_2px_6px_rgba(0,0,0,0.04)]',
        large &&
          'grid grid-rows-[220px_auto] border-border shadow-[0_22px_60px_rgba(0,0,0,0.10)]',
        className,
      )}
      onClick={onClick}
    >
      <div className="relative border-b border-border bg-muted">
        <MiniDiagram
          hue={template.hue}
          nodeCount={template.nodes || 6}
          edgeCount={template.edges || 6}
          seed={template.id.length}
          className={cn('block w-full', large ? 'h-[220px]' : 'h-[116px]')}
        />
        {template.recent && (
          <span className="absolute left-2.5 top-2.5 rounded-full bg-primary px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-primary-foreground">
            Continue
          </span>
        )}
        {template.starts && template.starts.length > 0 && (
          <span className="absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 font-mono text-[10px] tracking-wider text-brand">
            <svg width="10" height="10" viewBox="0 0 10 10">
              <circle cx="5" cy="5" r="2.5" fill="currentColor" />
              <circle
                cx="5"
                cy="5"
                r="4"
                stroke="currentColor"
                strokeWidth="0.8"
                fill="none"
              />
            </svg>
            {template.starts.length} starts
          </span>
        )}
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
            style={{ background: HUE_COLORS[template.hue] }}
          />
          <span className="text-foreground">{template.author}</span>
          <span className="text-border">·</span>
          <span className="font-mono text-[11px]">
            {template.nodes} nodes
          </span>
          {template.promotion &&
            template.promotion !== 'system' &&
            template.promotion !== 'personal' && (
              <PromotionBadge promotion={template.promotion} compact />
            )}
        </div>
        <h3
          className={cn(
            'font-semibold tracking-tight',
            large
              ? 'text-[22px] leading-tight'
              : 'text-[14.5px] leading-snug',
          )}
        >
          {template.title}
        </h3>
        {large && (
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            {template.desc}
          </p>
        )}
        {large && template.starts && template.starts.length > 0 && (
          <div className="mt-2">
            <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-muted-foreground">
              START FROM
            </span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {template.starts.slice(0, 3).map((s) => (
                <span
                  key={s.id}
                  className="inline-flex items-center gap-1.5 rounded-full bg-brand-muted px-2 py-0.5 text-[11.5px] text-brand"
                >
                  <span className="size-[5px] rounded-full bg-brand" />
                  {s.label}
                </span>
              ))}
              {template.starts.length > 3 && (
                <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11.5px] text-muted-foreground">
                  +{template.starts.length - 3}
                </span>
              )}
            </div>
          </div>
        )}
        <div className="mt-2.5 inline-flex items-center gap-1.5 self-start text-[13px] font-medium text-brand">
          {large ? 'View landscape' : 'Open'}
          {template.usedBy ? (
            <span className="ml-1 text-xs text-muted-foreground">
              · used by {template.usedBy}
            </span>
          ) : null}
          <ArrowRight className="size-3" />
        </div>
      </div>
    </article>
  )
}
