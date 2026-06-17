import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  Braces,
  Columns3,
  Database,
  GitFork,
  Loader2,
  Network,
  RouteIcon,
  Search,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import * as zod from 'zod'

import type { ModelInfo } from '@/api/contracts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { BUILDER_SCHEMA_QUERIES } from '@/features/builder/schemaModelQueries'
import {
  filterSchemaModels,
  findSchemaModel,
  getSchemaDiscoveryStats,
  getSchemaModelId,
  groupSchemaModelsByApp,
} from '@/features/schema-discovery/schemaDiscoveryModel'
import { cn } from '@/lib/utils'

const schemaDiscoverySearchSchema = zod.object({
  model: zod.string().optional(),
})

export const Route = createFileRoute('/_app/schema-discovery')({
  validateSearch: schemaDiscoverySearchSchema,
  ssr: false,
  component: SchemaDiscoveryRoute,
})

function SchemaDiscoveryRoute() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { model: selectedModelId } = Route.useSearch()
  const [query, setQuery] = useState('')
  const modelsQuery = useQuery(BUILDER_SCHEMA_QUERIES.models())
  const models = modelsQuery.data ?? []
  const filteredModels = useMemo(
    () => filterSchemaModels(models, query),
    [models, query],
  )
  const groupedModels = useMemo(
    () => groupSchemaModelsByApp(filteredModels),
    [filteredModels],
  )
  const selectedModel = findSchemaModel(models, selectedModelId ?? null)
  const stats = useMemo(() => getSchemaDiscoveryStats(models), [models])

  function selectModel(model: ModelInfo) {
    navigate({
      to: '/schema-discovery',
      search: { model: getSchemaModelId(model) },
    })
  }

  return (
    <section className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex min-h-14 flex-wrap items-center gap-3 border-b border-border px-3 py-2">
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold">
            {t('schemaDiscovery.title')}
          </h1>
          <p className="truncate text-xs text-muted-foreground">
            {selectedModelId ?? t('schemaDiscovery.allModels')}
          </p>
        </div>
        <div className="ml-auto flex h-9 min-w-[min(100%,22rem)] flex-1 items-center gap-2 rounded-md border border-input bg-muted px-2 md:max-w-xl">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('schemaDiscovery.searchPlaceholder')}
            className="h-8 min-w-0 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
          />
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_320px]">
        <ModelRail
          groups={groupedModels}
          isError={modelsQuery.isError}
          isLoading={modelsQuery.isLoading}
          selectedModelId={selectedModelId}
          onSelectModel={selectModel}
        />

        <main className="min-h-0 overflow-auto bg-muted/20 p-4">
          {selectedModel ? (
            <ModelRelationMap model={selectedModel} />
          ) : (
            <SchemaOverview
              isLoading={modelsQuery.isLoading}
              stats={stats}
              visibleModelCount={filteredModels.length}
            />
          )}
        </main>

        <ModelDetails model={selectedModel} />
      </div>
    </section>
  )
}

type ModelRailProps = {
  groups: Array<{ appName: string; models: ModelInfo[] }>
  isError: boolean
  isLoading: boolean
  selectedModelId: string | undefined
  onSelectModel: (model: ModelInfo) => void
}

function ModelRail({
  groups,
  isError,
  isLoading,
  selectedModelId,
  onSelectModel,
}: ModelRailProps) {
  const { t } = useTranslation()

  return (
    <aside className="hidden min-h-0 overflow-auto border-r border-border bg-background p-3 lg:block">
      <h2 className="text-xs font-medium text-muted-foreground">
        {t('schemaDiscovery.models')}
      </h2>
      <div className="mt-3 space-y-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {t('schemaDiscovery.loading')}
          </div>
        ) : null}
        {isError ? (
          <p className="text-sm text-destructive">
            {t('schemaDiscovery.loadError')}
          </p>
        ) : null}
        {!isLoading && !isError && groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('schemaDiscovery.noModels')}
          </p>
        ) : null}
        {groups.map((group) => (
          <div key={group.appName}>
            <div className="mb-1 px-2 text-xs text-muted-foreground">
              {group.appName}
            </div>
            <div className="space-y-1">
              {group.models.map((model) => {
                const modelId = getSchemaModelId(model)
                return (
                  <button
                    key={modelId}
                    type="button"
                    onClick={() => onSelectModel(model)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground',
                      selectedModelId === modelId &&
                        'bg-accent text-foreground',
                    )}
                  >
                    <Network className="size-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">
                      {model.verboseName}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {model.relations.length}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </aside>
  )
}

type SchemaOverviewProps = {
  isLoading: boolean
  stats: {
    appCount: number
    modelCount: number
    relationCount: number
  }
  visibleModelCount: number
}

function SchemaOverview({
  isLoading,
  stats,
  visibleModelCount,
}: SchemaOverviewProps) {
  const { t } = useTranslation()

  return (
    <div className="grid min-h-full content-start gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCell
          icon={Database}
          label={t('schemaDiscovery.stats.models')}
          value={isLoading ? '-' : stats.modelCount.toString()}
        />
        <StatCell
          icon={Columns3}
          label={t('schemaDiscovery.stats.apps')}
          value={isLoading ? '-' : stats.appCount.toString()}
        />
        <StatCell
          icon={GitFork}
          label={t('schemaDiscovery.stats.relations')}
          value={isLoading ? '-' : stats.relationCount.toString()}
        />
      </div>
      <div className="min-h-[420px] border border-border bg-background p-6">
        <div className="flex h-full min-h-[360px] items-center justify-center">
          <div className="max-w-sm text-center">
            <Network className="mx-auto size-8 text-muted-foreground" />
            <h2 className="mt-3 text-sm font-semibold">
              {t('schemaDiscovery.overviewTitle')}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('schemaDiscovery.overviewDescription', {
                count: visibleModelCount,
              })}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

type ModelRelationMapProps = {
  model: ModelInfo
}

function ModelRelationMap({ model }: ModelRelationMapProps) {
  const { t } = useTranslation()
  const relations = model.relations.slice(0, 12)

  return (
    <div className="grid min-h-full gap-4">
      <div className="border border-border bg-background p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">
              {model.verboseName}
            </h2>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {getSchemaModelId(model)}
            </p>
          </div>
          <div className="flex gap-4 text-sm text-muted-foreground">
            <span>
              {t('schemaDiscovery.fieldCount', { count: model.fields.length })}
            </span>
            <span>
              {t('schemaDiscovery.relationCount', {
                count: model.relations.length,
              })}
            </span>
          </div>
        </div>
      </div>

      <div className="min-h-[420px] border border-border bg-background p-4">
        <div className="grid h-full min-h-[360px] place-items-center">
          <div className="grid w-full max-w-3xl gap-4">
            <div className="mx-auto w-full max-w-sm border border-border bg-muted/30 p-4 text-center">
              <Database className="mx-auto size-6 text-muted-foreground" />
              <div className="mt-2 font-medium">{model.verboseName}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {model.dbTable}
              </div>
            </div>
            {relations.length ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {relations.map((relation) => (
                  <div
                    key={`${relation.name}:${relation.relatedModel}`}
                    className="border border-border bg-background p-3"
                  >
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <GitFork className="size-4 text-muted-foreground" />
                      <span className="truncate">{relation.name}</span>
                    </div>
                    <div className="mt-1 truncate text-xs text-muted-foreground">
                      {relation.relatedModel}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-sm text-muted-foreground">
                {t('schemaDiscovery.noRelations')}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

type ModelDetailsProps = {
  model: ModelInfo | null
}

function ModelDetails({ model }: ModelDetailsProps) {
  const { t } = useTranslation()

  return (
    <aside className="min-h-0 overflow-auto border-t border-border bg-background p-3 xl:border-l xl:border-t-0">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">
          {t('schemaDiscovery.details')}
        </h2>
        <Button variant="outline" size="sm" disabled={!model}>
          <RouteIcon className="size-4" />
          {t('schemaDiscovery.route')}
        </Button>
      </div>

      {!model ? (
        <p className="mt-4 text-sm text-muted-foreground">
          {t('schemaDiscovery.noSelection')}
        </p>
      ) : (
        <div className="mt-4 grid gap-5">
          <dl className="grid gap-3 text-sm">
            <DetailRow
              label={t('schemaDiscovery.selection')}
              value={getSchemaModelId(model)}
            />
            <DetailRow
              label={t('schemaDiscovery.table')}
              value={model.dbTable}
            />
            <DetailRow
              label={t('schemaDiscovery.managed')}
              value={
                model.managed
                  ? t('schemaDiscovery.yes')
                  : t('schemaDiscovery.no')
              }
            />
          </dl>

          <DetailList
            icon={Braces}
            title={t('schemaDiscovery.fields')}
            items={model.fields.slice(0, 12).map((field) => ({
              label: field.name,
              meta: field.type,
            }))}
          />
          <DetailList
            icon={GitFork}
            title={t('schemaDiscovery.relations')}
            items={model.relations.slice(0, 12).map((relation) => ({
              label: relation.name,
              meta: relation.relatedModel,
            }))}
          />
        </div>
      )}
    </aside>
  )
}

type DetailRowProps = {
  label: string
  value: string
}

function DetailRow({ label, value }: DetailRowProps) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words font-medium">{value}</dd>
    </div>
  )
}

type DetailListProps = {
  icon: typeof Braces
  items: Array<{ label: string; meta: string }>
  title: string
}

function DetailList({ icon: Icon, items, title }: DetailListProps) {
  const { t } = useTranslation()

  return (
    <section>
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="size-4 text-muted-foreground" />
        {title}
      </h3>
      {items.length ? (
        <div className="mt-2 grid gap-1">
          {items.map((item) => (
            <div
              key={`${item.label}:${item.meta}`}
              className="flex min-w-0 items-center justify-between gap-3 border-b border-border/60 py-1.5 text-sm"
            >
              <span className="min-w-0 truncate">{item.label}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {item.meta}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          {t('schemaDiscovery.emptyList')}
        </p>
      )}
    </section>
  )
}

type StatCellProps = {
  icon: typeof Database
  label: string
  value: string
}

function StatCell({ icon: Icon, label, value }: StatCellProps) {
  return (
    <div className="border border-border bg-background p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-4" />
        {label}
      </div>
      <div className="mt-2 text-xl font-semibold">{value}</div>
    </div>
  )
}
