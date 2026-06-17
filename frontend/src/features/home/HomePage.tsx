import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { ArrowRight, Pencil, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'

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
import { TemplateDetailPanel } from './TemplateDetailPanel'
import type {
  HomeTemplateFilter,
  HomeTemplateNavigationTarget,
  HomeTemplatePreview,
} from './types'

const FILTER_CHIPS: { id: HomeTemplateFilter }[] = [
  { id: 'all' },
  { id: 'ready' },
  { id: 'needs_record' },
  { id: 'issues' },
  { id: 'own' },
  { id: 'featured' },
]

function getQueryErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export function HomePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [activeFilter, setActiveFilter] = useState<HomeTemplateFilter>('all')
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null,
  )
  const {
    data: authSession,
    error: authSessionError,
    isError: isAuthSessionError,
    isFetching: isAuthSessionFetching,
    isSuccess: isAuthSessionSuccess,
    refetch: refetchAuthSession,
  } = useQuery(START_AUTH_SESSION_QUERY)
  const hasResolvedAuthSession = isAuthSessionSuccess && !isAuthSessionFetching
  const canLoadTemplates =
    hasResolvedAuthSession && canLoadHomeQuickAccess(authSession)
  const {
    data: ownRecentData,
    error: ownRecentError,
    isError: isOwnRecentError,
    isLoading: isOwnRecentLoading,
    refetch: refetchOwnRecent,
  } = useQuery({
    ...HOME_QUICK_ACCESS_QUERIES.ownRecent(),
    enabled: canLoadTemplates,
  })
  const {
    data: featuredData,
    error: featuredError,
    isError: isFeaturedError,
    isLoading: isFeaturedLoading,
    refetch: refetchFeatured,
  } = useQuery({
    ...HOME_QUICK_ACCESS_QUERIES.featured({
      limit: HOME_FEATURED_TEMPLATE_LIMIT,
    }),
    enabled: canLoadTemplates,
  })

  useEffect(() => {
    if (hasResolvedAuthSession && shouldRedirectHomeToLogin(authSession)) {
      redirectToLogin()
    }
  }, [authSession, hasResolvedAuthSession])

  const ownRecentTemplates = createHomeTemplatePreviews(
    ownRecentData?.ownRecent ?? [],
  )
  const featuredTemplates = createHomeTemplatePreviews(
    featuredData?.results ?? [],
  )
  const allTemplates = uniqueHomeTemplatePreviews([
    ...featuredTemplates,
    ...ownRecentTemplates,
  ])
  const filteredTemplates = filterHomeTemplatePreviews(
    allTemplates,
    activeFilter,
  )
  const primaryTemplate = ownRecentTemplates[0] ?? featuredTemplates[0] ?? null
  const selectedTemplate = selectedTemplateId
    ? (allTemplates.find((template) => template.id === selectedTemplateId) ??
      null)
    : null
  const readyCount = allTemplates.filter(
    (template) => template.status === 'ready',
  ).length
  const attentionCount = allTemplates.filter(
    (template) => template.status !== 'ready',
  ).length
  const isLoading = isOwnRecentLoading || isFeaturedLoading
  const errorMessage =
    isOwnRecentError || isFeaturedError
      ? getQueryErrorMessage(
          ownRecentError ?? featuredError,
          t('home.error.loadTemplates'),
        )
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

  function handleEditTemplate(template: HomeTemplatePreview) {
    void navigate({
      to: '/builder',
      search: { templateId: template.id },
    })
  }

  function handlePickTemplateRecord(
    template: HomeTemplatePreview,
    recordId: string,
  ) {
    if (!template.shareSlug) return
    void navigate({
      to: '/generate/$slug/$recordId',
      params: { slug: template.shareSlug, recordId },
    })
  }

  function handleSelectTemplate(template: HomeTemplatePreview) {
    setSelectedTemplateId(template.id)
  }

  function handleOpenBuilder() {
    void navigate({ to: '/builder' })
  }

  if (isAuthSessionError) {
    return (
      <AuthGateStatus
        label={getQueryErrorMessage(
          authSessionError,
          t('home.error.loadTemplates'),
        )}
        onRetry={() => void refetchAuthSession()}
      />
    )
  }

  if (!hasResolvedAuthSession) {
    return <AuthGateStatus label={t('home.auth.checkingSignIn')} />
  }

  if (!canLoadTemplates) {
    return <AuthGateStatus label={t('home.auth.openingSignIn')} />
  }

  return (
    <div className="flex h-full overflow-hidden bg-background text-foreground">
      <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
        <div className="mx-auto max-w-[1480px] px-6 pb-20 pt-7">
          <section className="mb-2 border-b border-border pb-6 pt-2">
            <div className="flex items-end justify-between gap-6">
              <div>
                <h1 className="text-[32px] font-semibold leading-tight tracking-tight">
                  {t('home.hero.title')}
                </h1>
              </div>
              <div className="flex gap-2.5">
                <Button
                  variant="outline"
                  className="rounded-[10px] border-border bg-background px-3.5 text-[13.5px] text-foreground hover:bg-accent"
                  onClick={handleOpenBuilder}
                >
                  {t('home.hero.newFromScratch')}
                </Button>
                <Button
                  className="gap-2 rounded-[10px] bg-primary px-3.5 text-[13.5px] text-primary-foreground hover:bg-primary/90"
                  disabled={!primaryTemplate}
                  onClick={() =>
                    primaryTemplate && handleSelectTemplate(primaryTemplate)
                  }
                >
                  {primaryTemplate?.source === 'own'
                    ? t('home.hero.reviewLastOpened')
                    : t('home.hero.reviewFeatured')}
                  <ArrowRight className="size-3.5" />
                </Button>
              </div>
            </div>

            <div className="mt-[18px] flex items-center gap-7">
              <StatBlock
                value={featuredTemplates.length}
                label={t('home.stats.featured')}
              />
              <StatBlock
                value={ownRecentTemplates.length}
                label={t('home.stats.recentOwned')}
              />
              <StatBlock
                value={readyCount}
                label={t('home.stats.readyPreviews')}
              />
              <StatBlock
                value={attentionCount}
                label={t('home.stats.needAttention')}
              />
              {/* TODO: uncomment when connection status indicator is needed */}
            </div>
          </section>

          {errorMessage ? (
            <ErrorBanner
              message={errorMessage}
              onRetry={() =>
                void Promise.all([refetchOwnRecent(), refetchFeatured()])
              }
            />
          ) : null}

          {isLoading && allTemplates.length === 0 ? (
            <TemplateSectionSkeleton />
          ) : (
            <HomeTemplateSections
              activeFilter={activeFilter}
              featuredTemplates={featuredTemplates}
              filteredTemplates={filteredTemplates}
              ownRecentTemplates={ownRecentTemplates}
              selectedTemplateId={selectedTemplateId}
              onFilterChange={setActiveFilter}
              onSelectTemplate={handleSelectTemplate}
            />
          )}

          <section className="mt-9 flex items-center justify-between gap-6 rounded-[10px] border border-border bg-card px-[22px] py-[18px]">
            <div className="flex items-center gap-3.5">
              <Pencil className="size-[18px] text-muted-foreground" />
              <div>
                <h2 className="text-[15px] font-semibold tracking-tight">
                  {t('home.editor.title')}
                </h2>
                <p className="text-[13px] text-muted-foreground">
                  {t('home.editor.description')}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              className="rounded-[10px] border-border bg-background px-3.5 text-[13.5px] text-foreground hover:bg-accent"
              onClick={handleOpenBuilder}
            >
              {t('home.editor.open')}
              <ArrowRight className="size-3.5" />
            </Button>
          </section>
        </div>
      </main>
      {selectedTemplate ? (
        <TemplateDetailPanel
          key={selectedTemplate.id}
          template={selectedTemplate}
          onClose={() => setSelectedTemplateId(null)}
          onEdit={handleEditTemplate}
          onOpen={handleOpenTemplate}
          onPickRecord={handlePickTemplateRecord}
        />
      ) : null}
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
  const { t } = useTranslation()
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
            {t('home.auth.retry')}
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function HomeTemplateSections({
  activeFilter,
  featuredTemplates,
  filteredTemplates,
  onFilterChange,
  onSelectTemplate,
  ownRecentTemplates,
  selectedTemplateId,
}: {
  activeFilter: HomeTemplateFilter
  featuredTemplates: HomeTemplatePreview[]
  filteredTemplates: HomeTemplatePreview[]
  onFilterChange: (filter: HomeTemplateFilter) => void
  onSelectTemplate: (template: HomeTemplatePreview) => void
  ownRecentTemplates: HomeTemplatePreview[]
  selectedTemplateId: string | null
}) {
  const { t } = useTranslation()
  return (
    <>
      <PromotedRow templates={featuredTemplates} onOpen={onSelectTemplate} />

      <section className="border-t border-border pb-2 pt-[22px]">
        <div className="mb-3.5 flex items-start justify-between gap-6">
          <h2 className="text-base font-semibold tracking-tight">
            {t('home.sections.recent')}
          </h2>
          <span className="text-[12.5px] text-muted-foreground">
            {t('home.count.owned', { count: ownRecentTemplates.length })}
          </span>
        </div>
        {ownRecentTemplates.length > 0 ? (
          <TemplateCardGrid
            templates={ownRecentTemplates}
            selectedTemplateId={selectedTemplateId}
            onSelectTemplate={onSelectTemplate}
          />
        ) : (
          <EmptySection label={t('home.sections.emptyRecent')} />
        )}
      </section>

      <section className="border-t border-border pb-2 pt-[22px]">
        <div className="mb-3.5 flex items-start justify-between gap-6">
          <h2 className="text-base font-semibold tracking-tight">
            {t('home.sections.allTemplates')}
          </h2>
          <div className="inline-flex rounded-[8px] border border-border bg-background p-0.5">
            {FILTER_CHIPS.map((chip) => (
              <button
                key={chip.id}
                type="button"
                className={cn(
                  'rounded-[6px] px-2.5 py-1 text-[12.5px] transition-colors',
                  activeFilter === chip.id
                    ? 'bg-secondary text-secondary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
                onClick={() => onFilterChange(chip.id)}
              >
                {t(`home.filters.${chip.id}`)}
              </button>
            ))}
          </div>
        </div>
        {filteredTemplates.length > 0 ? (
          <TemplateCardGrid
            templates={filteredTemplates}
            selectedTemplateId={selectedTemplateId}
            onSelectTemplate={onSelectTemplate}
          />
        ) : (
          <EmptySection label={t('home.sections.emptyFilter')} />
        )}
      </section>
    </>
  )
}

function TemplateCardGrid({
  onSelectTemplate,
  selectedTemplateId,
  templates,
}: {
  onSelectTemplate: (template: HomeTemplatePreview) => void
  selectedTemplateId: string | null
  templates: HomeTemplatePreview[]
}) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,280px))] gap-3">
      {templates.map((template) => (
        <TemplateCard
          key={template.id}
          template={template}
          className={
            selectedTemplateId === template.id
              ? 'border-foreground/60'
              : undefined
          }
          onClick={() => onSelectTemplate(template)}
        />
      ))}
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
        {t('home.auth.retry')}
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
        <div className="h-[220px] rounded-[10px] border border-border bg-muted" />
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="h-[69px] rounded-[10px] border border-border bg-muted"
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
      <span className="text-[12px] text-muted-foreground">{label}</span>
    </div>
  )
}
