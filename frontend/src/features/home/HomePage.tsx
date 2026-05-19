import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { ArrowRight, Pencil, RefreshCw } from 'lucide-react'

import { START_AUTH_SESSION_QUERY } from '@/api/startAuthSession'
import { redirectToLogin } from '@/api/sourceAuth'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { TemplateCard } from '@/components/TemplateCard'
import {
  HOME_FEATURED_TEMPLATE_LIMIT,
  HOME_QUICK_ACCESS_QUERIES,
} from './homeQuickAccessQueries'
import {
  createHomeTemplatePreviews,
  filterHomeTemplatePreviews,
  uniqueHomeTemplatePreviews,
} from './homeTemplatePreview'
import {
  canLoadHomeQuickAccess,
  shouldRedirectHomeToLogin,
} from './homeAuthGate'
import { PromotedRow } from './PromotedRow'
import type {
  HomeTemplateFilter,
  HomeTemplateNavigationTarget,
  HomeTemplatePreview,
} from './types'

const FILTER_CHIPS: { id: HomeTemplateFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'ready', label: 'Ready' },
  { id: 'needs_record', label: 'Needs record' },
  { id: 'issues', label: 'Issues' },
  { id: 'own', label: 'Owned' },
  { id: 'featured', label: 'Featured' },
]

function getQueryErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Could not load templates'
}

export function HomePage() {
  const navigate = useNavigate()
  const [activeFilter, setActiveFilter] = useState<HomeTemplateFilter>('all')
  const authSessionQuery = useQuery(START_AUTH_SESSION_QUERY)
  const hasResolvedAuthSession =
    authSessionQuery.isSuccess && !authSessionQuery.isFetching
  const canLoadTemplates =
    hasResolvedAuthSession && canLoadHomeQuickAccess(authSessionQuery.data)
  const ownRecentQuery = useQuery({
    ...HOME_QUICK_ACCESS_QUERIES.ownRecent(),
    enabled: canLoadTemplates,
  })
  const featuredQuery = useQuery({
    ...HOME_QUICK_ACCESS_QUERIES.featured({
      limit: HOME_FEATURED_TEMPLATE_LIMIT,
    }),
    enabled: canLoadTemplates,
  })

  useEffect(() => {
    if (
      hasResolvedAuthSession &&
      shouldRedirectHomeToLogin(authSessionQuery.data)
    ) {
      redirectToLogin()
    }
  }, [authSessionQuery.data, hasResolvedAuthSession])

  const ownRecentTemplates = useMemo(
    () => createHomeTemplatePreviews(ownRecentQuery.data?.ownRecent ?? []),
    [ownRecentQuery.data?.ownRecent],
  )
  const featuredTemplates = useMemo(
    () => createHomeTemplatePreviews(featuredQuery.data?.results ?? []),
    [featuredQuery.data?.results],
  )
  const allTemplates = useMemo(
    () =>
      uniqueHomeTemplatePreviews([...featuredTemplates, ...ownRecentTemplates]),
    [featuredTemplates, ownRecentTemplates],
  )
  const filteredTemplates = useMemo(
    () => filterHomeTemplatePreviews(allTemplates, activeFilter),
    [activeFilter, allTemplates],
  )
  const primaryTemplate = ownRecentTemplates[0] ?? featuredTemplates[0] ?? null
  const readyCount = allTemplates.filter(
    (template) => template.status === 'ready',
  ).length
  const attentionCount = allTemplates.filter(
    (template) => template.status !== 'ready',
  ).length
  const isLoading = ownRecentQuery.isLoading || featuredQuery.isLoading
  const errorMessage =
    ownRecentQuery.isError || featuredQuery.isError
      ? getQueryErrorMessage(ownRecentQuery.error ?? featuredQuery.error)
      : null

  function navigateToTarget(target: HomeTemplateNavigationTarget) {
    if (target.type === 'generation-run') {
      void navigate({
        to: '/generate/$slug/$recordId',
        params: { slug: target.shareSlug, recordId: target.recordId },
      })
      return
    }

    if (target.type === 'generation-select-record') {
      void navigate({
        to: '/generate/$slug',
        params: { slug: target.shareSlug },
      })
      return
    }

    void navigate({
      to: '/builder',
      search: { templateId: target.templateId },
    })
  }

  function handleOpenTemplate(template: HomeTemplatePreview) {
    navigateToTarget(template.navigationTarget)
  }

  function handleOpenBuilder() {
    void navigate({ to: '/builder' })
  }

  if (authSessionQuery.isError) {
    return (
      <AuthGateStatus
        label={getQueryErrorMessage(authSessionQuery.error)}
        onRetry={() => void authSessionQuery.refetch()}
      />
    )
  }

  if (!hasResolvedAuthSession) {
    return <AuthGateStatus label="Checking sign-in" />
  }

  if (!canLoadTemplates) {
    return <AuthGateStatus label="Opening sign-in" />
  }

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden bg-background text-foreground">
      <main className="mx-auto max-w-[1480px] px-9 pb-20 pt-7">
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
                disabled={!primaryTemplate}
                onClick={() =>
                  primaryTemplate && handleOpenTemplate(primaryTemplate)
                }
              >
                {primaryTemplate?.source === 'own'
                  ? 'Open last opened'
                  : 'Open featured'}
                <ArrowRight className="size-3.5" />
              </Button>
            </div>
          </div>

          <div className="mt-[18px] flex items-center gap-7">
            <StatBlock value={featuredTemplates.length} label="featured" />
            <StatBlock value={ownRecentTemplates.length} label="recent owned" />
            <StatBlock value={readyCount} label="ready previews" />
            <StatBlock value={attentionCount} label="need attention" />
            <div className="flex-1" />
            <div
              className={cn(
                'inline-flex items-center gap-[7px] rounded-full border border-border px-2.5 py-1.5 font-mono text-[11.5px] text-muted-foreground',
                errorMessage && 'text-destructive',
              )}
            >
              <span
                className={cn(
                  'size-[7px] rounded-full bg-chart-2 shadow-[0_0_0_3px_color-mix(in_oklab,var(--chart-2)_18%,transparent)]',
                  errorMessage && 'bg-destructive shadow-none',
                )}
              />
              {isLoading
                ? 'loading'
                : errorMessage
                  ? 'needs attention'
                  : 'connected'}
            </div>
          </div>
        </section>

        {errorMessage ? (
          <ErrorBanner
            message={errorMessage}
            onRetry={() =>
              void Promise.all([
                ownRecentQuery.refetch(),
                featuredQuery.refetch(),
              ])
            }
          />
        ) : null}

        {isLoading && allTemplates.length === 0 ? (
          <TemplateSectionSkeleton />
        ) : (
          <>
            <PromotedRow
              templates={featuredTemplates}
              onOpen={handleOpenTemplate}
            />

            <section className="border-t border-border pb-2 pt-[22px]">
              <div className="mb-3.5 flex items-start justify-between gap-6">
                <h2 className="text-base font-semibold tracking-tight">
                  Recent
                </h2>
                <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                  {ownRecentTemplates.length} owned
                </span>
              </div>
              {ownRecentTemplates.length > 0 ? (
                <div className="grid grid-cols-3 gap-[18px]">
                  {ownRecentTemplates.map((template) => (
                    <TemplateCard
                      key={template.id}
                      template={template}
                      onClick={() => handleOpenTemplate(template)}
                    />
                  ))}
                </div>
              ) : (
                <EmptySection label="No recent templates yet" />
              )}
            </section>

            <section className="border-t border-border pb-2 pt-[22px]">
              <div className="mb-3.5 flex items-start justify-between gap-6">
                <h2 className="text-base font-semibold tracking-tight">
                  All templates
                </h2>
                <div className="flex gap-1.5">
                  {FILTER_CHIPS.map((chip) => (
                    <button
                      key={chip.id}
                      type="button"
                      className={cn(
                        'rounded-full border border-transparent px-3 py-1 text-[12.5px]',
                        activeFilter === chip.id
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground',
                      )}
                      onClick={() => setActiveFilter(chip.id)}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
              </div>
              {filteredTemplates.length > 0 ? (
                <div className="grid grid-cols-2 gap-[18px] lg:grid-cols-4">
                  {filteredTemplates.map((template) => (
                    <TemplateCard
                      key={template.id}
                      template={template}
                      onClick={() => handleOpenTemplate(template)}
                    />
                  ))}
                </div>
              ) : (
                <EmptySection label="No templates match this filter" />
              )}
            </section>
          </>
        )}

        <section className="mt-9 flex items-center justify-between gap-6 rounded-[14px] border border-border bg-card px-[22px] py-[18px]">
          <div className="flex items-center gap-3.5">
            <Pencil className="size-[18px] text-muted-foreground" />
            <div>
              <h2 className="text-[15px] font-semibold tracking-tight">
                Recipe editor
              </h2>
              <p className="text-[13px] text-muted-foreground">
                Author templates with layers, relations, style, and layout.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            className="rounded-[10px] border-border bg-background px-3.5 text-[13.5px] text-foreground hover:bg-accent"
            onClick={handleOpenBuilder}
          >
            Open editor
            <ArrowRight className="size-3.5" />
          </Button>
        </section>
      </main>
    </div>
  )
}

function AuthGateStatus({
  label,
  onRetry,
}: {
  label: string
  onRetry?: () => void
}) {
  return (
    <div className="grid h-full place-items-center bg-background px-6 text-foreground">
      <div className="flex items-center gap-3 text-[13px] text-muted-foreground">
        <RefreshCw className="size-4 animate-spin" />
        <span>{label}</span>
        {onRetry ? (
          <Button
            variant="outline"
            className="ml-2 h-8 rounded-[8px] border-border bg-background px-3 text-[12.5px] text-foreground hover:bg-accent"
            onClick={onRetry}
          >
            Retry
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function ErrorBanner({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <section className="mt-4 flex items-center justify-between gap-4 rounded-[10px] border border-destructive/30 bg-destructive/10 px-4 py-3 text-destructive">
      <span className="text-[13px]">{message}</span>
      <Button
        variant="outline"
        className="h-8 gap-2 rounded-[8px] border-destructive/30 bg-background text-[12.5px] text-destructive hover:bg-destructive/10"
        onClick={onRetry}
      >
        <RefreshCw className="size-3.5" />
        Retry
      </Button>
    </section>
  )
}

function EmptySection({ label }: { label: string }) {
  return (
    <div className="grid min-h-[116px] place-items-center rounded-[10px] border border-dashed border-border bg-muted/40 px-4 py-8 text-[13px] text-muted-foreground">
      {label}
    </div>
  )
}

function TemplateSectionSkeleton() {
  return (
    <section className="border-t border-border pb-4 pt-7">
      <div className="mb-4 h-6 w-56 rounded bg-muted" />
      <div className="grid grid-cols-[1.4fr_1fr] gap-4">
        <div className="h-[220px] rounded-[14px] border border-border bg-muted" />
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="h-[69px] rounded-[14px] border border-border bg-muted"
            />
          ))}
        </div>
      </div>
    </section>
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
