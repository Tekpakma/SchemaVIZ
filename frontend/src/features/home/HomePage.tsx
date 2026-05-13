import { useNavigate } from '@tanstack/react-router'
import { ArrowRight, Pencil } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { TemplateCard } from '@/components/TemplateCard'
import { MOCK_STATS, MOCK_TEMPLATES } from './mockData'
import { PromotedRow } from './PromotedRow'
import type { Template } from './types'

const FILTER_CHIPS = ['All', 'ERD', 'Infrastructure', 'Data flow', 'Domain']

export function HomePage() {
  const navigate = useNavigate()

  function handleOpenTemplate(tpl: Template) {
    // TODO: Navigate to viewer route with template id
    // e.g. navigate({ to: '/viewer/$templateId', params: { templateId: tpl.id } })
    console.info('[POC] Open template:', tpl.id, tpl.title)
  }

  function handleOpenBuilder() {
    navigate({ to: '/builder' })
  }
  const featured = MOCK_TEMPLATES[0]!
  const continueRow = [MOCK_TEMPLATES[0]!, MOCK_TEMPLATES[2]!, MOCK_TEMPLATES[3]!]
  const browseRow = [
    MOCK_TEMPLATES[1]!,
    MOCK_TEMPLATES[4]!,
    MOCK_TEMPLATES[5]!,
    MOCK_TEMPLATES[6]!,
  ]

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden bg-background text-foreground">
      <main className="mx-auto max-w-[1480px] px-9 pb-20 pt-7">
        {/* Workbench header */}
        <section className="mb-2 border-b border-border pb-6 pt-2">
          <div className="flex items-end justify-between gap-6">
            <div className="flex flex-col gap-1.5">
              <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                <span className="size-[7px] rounded-full bg-brand" />
                Templates
              </span>
              <h1 className="text-[32px] font-semibold leading-tight tracking-tight">
                Landscapes
              </h1>
            </div>
            <div className="flex gap-2.5">
              <Button
                variant="outline"
                className="rounded-[10px] border-border bg-background px-3.5 text-[13.5px] text-foreground hover:bg-accent"
                onClick={handleOpenBuilder}
              >
                + New from scratch
              </Button>
              <Button
                className="gap-2 rounded-[10px] bg-primary px-3.5 text-[13.5px] text-primary-foreground hover:bg-primary/90"
                onClick={() => handleOpenTemplate(featured)}
              >
                Open last opened
                <ArrowRight className="size-3.5" />
              </Button>
            </div>
          </div>

          {/* Stats row */}
          <div className="mt-[18px] flex items-center gap-7">
            {/* TODO: Wire to backend stats API */}
            <StatBlock value={MOCK_STATS.templateCount} label="templates · org" />
            <StatBlock value={MOCK_STATS.ownedLandscapes} label="landscapes you own" />
            <StatBlock value={MOCK_STATS.sharedWithYou} label="shared with you" />
            <StatBlock value={MOCK_STATS.nodePresets} label="node presets" />
            <div className="flex-1" />
            <div className="inline-flex items-center gap-[7px] rounded-full border border-border px-2.5 py-1.5 font-mono text-[11.5px] text-muted-foreground">
              <span className="size-[7px] rounded-full bg-chart-2 shadow-[0_0_0_3px_color-mix(in_oklab,var(--chart-2)_18%,transparent)]" />
              connected
            </div>
          </div>
        </section>

        {/* Promoted in your org */}
        <PromotedRow templates={MOCK_TEMPLATES} onOpen={handleOpenTemplate} />

        {/* Recent */}
        <section className="border-t border-border pb-2 pt-[22px]">
          <div className="mb-3.5 flex items-start justify-between gap-6">
            <h2 className="text-base font-semibold tracking-tight">Recent</h2>
            {/* TODO: Wire to "all recent" view */}
            <button className="text-[13px] text-brand">View all</button>
          </div>
          <div className="grid grid-cols-3 gap-[18px]">
            {continueRow.map((t) => (
              <TemplateCard
                key={t.id}
                template={t}
                onClick={() => handleOpenTemplate(t)}
              />
            ))}
          </div>
        </section>

        {/* All templates */}
        <section className="border-t border-border pb-2 pt-[22px]">
          <div className="mb-3.5 flex items-start justify-between gap-6">
            <h2 className="text-base font-semibold tracking-tight">
              All templates
            </h2>
            {/* TODO: Wire filter chips to query params for filtering */}
            <div className="flex gap-1.5">
              {FILTER_CHIPS.map((chip, i) => (
                <button
                  key={chip}
                  className={cn(
                    'rounded-full border border-transparent px-3 py-1 text-[12.5px]',
                    i === 0
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-[18px] lg:grid-cols-4">
            {browseRow.map((t) => (
              <TemplateCard
                key={t.id}
                template={t}
                onClick={() => handleOpenTemplate(t)}
              />
            ))}
          </div>
        </section>

        {/* Editor CTA */}
        <section className="mt-9 flex items-center justify-between gap-6 rounded-[14px] border border-border bg-card px-[22px] py-[18px]">
          <div className="flex items-center gap-3.5">
            <Pencil className="size-[18px] text-muted-foreground" />
            <div>
              <h2 className="text-[15px] font-semibold tracking-tight">
                Recipe editor
              </h2>
              <p className="text-[13px] text-muted-foreground">
                Author a new template — layers, relations, style, layout.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            className="rounded-[10px] border-border bg-background px-3.5 text-[13.5px] text-foreground hover:bg-accent"
            onClick={handleOpenBuilder}
          >
            Open editor →
          </Button>
        </section>
      </main>
    </div>
  )
}

function StatBlock({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col gap-px">
      <span className="text-lg font-semibold tracking-tight">{value}</span>
      <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </span>
    </div>
  )
}
