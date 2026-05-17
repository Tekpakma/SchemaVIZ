import { ArrowRight } from 'lucide-react'

import type { Template } from './types'
import { MiniDiagram } from '@/components/MiniDiagram'
import { PromotionBadge } from '@/components/PromotionBadge'

interface PromotedRowProps {
  templates: Template[]
  onOpen: (tpl: Template) => void
}

const AVATAR_COLORS = [
  'var(--brand)',
  'var(--chart-2)',
  'var(--chart-5)',
  'var(--brand-muted)',
  'var(--foreground)',
]

export function PromotedRow({ templates, onOpen }: PromotedRowProps) {
  const promoted = templates.filter((t) => t.promotion === 'featured')
  if (promoted.length === 0) return null

  const featured = promoted[0]!
  const rest = promoted.slice(1, 4)

  return (
    <section className="border-t border-border pb-4 pt-7 text-foreground">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            <span className="size-[7px] rounded-full bg-brand" />
            Promoted templates
          </span>
          <h2 className="mt-1.5 text-xl font-semibold tracking-tight">
            Templates your org uses
          </h2>
        </div>
        {/* TODO: Wire to promotion management route */}
        <button className="text-[13px] text-brand">
          Manage promotions →
        </button>
      </div>

      <div className="grid grid-cols-[1.4fr_1fr] gap-4">
        {/* Featured card */}
        <article
          className="group grid min-h-[220px] cursor-pointer grid-cols-2 overflow-hidden rounded-[14px] border border-border bg-card text-card-foreground shadow-[0_8px_24px_color-mix(in_oklab,var(--brand)_8%,transparent)] transition-all duration-150 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(0,0,0,0.10)]"
          onClick={() => onOpen(featured)}
        >
          <div className="flex items-center justify-center border-r border-border bg-brand-muted p-3.5">
            <MiniDiagram
              hue={featured.hue}
              nodeCount={featured.nodes || 6}
              edgeCount={featured.edges || 6}
              seed={featured.id.length + 7}
              className="h-[180px] w-full"
            />
          </div>
          <div className="flex flex-col gap-2 px-5 py-[18px]">
            <PromotionBadge promotion={featured.promotion!} />
            <h3 className="mt-1 text-lg font-semibold tracking-tight">
              {featured.title}
            </h3>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              {featured.desc}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>
                Promoted by{' '}
                <span className="font-semibold text-foreground">
                  {featured.promotedBy}
                </span>
              </span>
              <span className="text-border">·</span>
              <span>{featured.promotedWhen}</span>
              <span className="text-border">·</span>
              <span>
                <span className="font-semibold text-foreground">
                  {featured.usedBy}
                </span>{' '}
                people using
              </span>
            </div>
            <div className="mt-2 flex items-center">
              {Array.from({ length: 5 }).map((_, i) => (
                <span
                  key={i}
                  className="grid size-[22px] place-items-center rounded-full border-2 border-card text-[9px] font-semibold tracking-wide text-brand-foreground"
                  style={{
                    background: AVATAR_COLORS[i % 5],
                    marginLeft: i === 0 ? 0 : -6,
                  }}
                >
                  {String.fromCharCode(65 + i)}
                  {String.fromCharCode(75 + i)}
                </span>
              ))}
              <span className="ml-2 font-mono text-[11px] text-muted-foreground">
                +{Math.max(0, (featured.usedBy ?? 0) - 5)}
              </span>
            </div>
          </div>
        </article>

        {/* Sidebar list */}
        <div className="flex flex-col gap-2">
          {rest.map((t) => (
            <div
              key={t.id}
              className="group/item grid cursor-pointer grid-cols-[60px_1fr_auto] items-center gap-3 rounded-[14px] border border-border bg-card px-3.5 py-2.5 text-card-foreground transition-all duration-100 hover:translate-x-0.5 hover:border-muted-foreground/45"
              onClick={() => onOpen(t)}
            >
              <div className="h-12 overflow-hidden rounded-lg border border-border bg-muted p-1">
                <MiniDiagram
                  hue={t.hue}
                  nodeCount={t.nodes}
                  edgeCount={t.edges}
                  seed={t.id.length + 3}
                  className="size-full"
                />
              </div>
              <div className="flex min-w-0 flex-col gap-0.5">
                <PromotionBadge promotion={t.promotion!} compact />
                <h4 className="mt-0.5 text-[13.5px] font-semibold tracking-tight">
                  {t.title}
                </h4>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>by {t.promotedBy}</span>
                  <span className="text-border">·</span>
                  <span>{t.usedBy} using</span>
                </div>
              </div>
              <ArrowRight className="size-3 text-muted-foreground transition-colors group-hover/item:text-brand" />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
