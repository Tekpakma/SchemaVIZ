import { useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { Check, ChevronsUpDown, Loader2, Play, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandLoading,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { SHARED_GENERATION_QUERIES } from '@/features/builder/sharedGenerationQueries'
import { FilterImpactNotice } from '@/features/builder/FilterImpactNotice'
import { usePaginatedRecords } from '@/features/lexical/dataReference/usePaginatedRecords'
import { splitModelId } from '@/features/lexical/dataReference/modelUtils'
import { BrandLogo } from '@/components/navbar/BrandLogo'
import { DeleteGenerationTemplateButton } from '@/features/builder/DeleteGenerationTemplateButton'

export const Route = createFileRoute('/generate/$slug/')({
  ssr: false,
  loader: ({ context: { queryClient }, params: { slug } }) =>
    queryClient.ensureQueryData(SHARED_GENERATION_QUERIES.template(slug)),
  pendingComponent: () => (
    <div className="flex h-dvh w-dvw items-center justify-center bg-background">
      <Loader2 className="size-8 animate-spin text-muted-foreground" />
    </div>
  ),
  component: GenerateTemplatePage,
})

function getRecordPk(fields: Record<string, unknown>): string {
  const pk = fields.pk ?? fields.id ?? ''
  return String(pk)
}

function GenerateTemplatePage() {
  const { t } = useTranslation()
  const { slug } = Route.useParams()

  const { data: template } = useSuspenseQuery(
    SHARED_GENERATION_QUERIES.template(slug),
  )

  const rootModelId =
    template.publishedVersion?.rootModel ??
    template.draftVersion?.rootModel ??
    ''
  const rootModelRef = rootModelId ? splitModelId(rootModelId) : null
  const [open, setOpen] = useState(false)

  const recordsQuery = usePaginatedRecords(
    {
      appLabel: rootModelRef?.appLabel ?? '',
      modelName: rootModelRef?.modelName ?? '',
      page: 1,
    },
    { enabled: Boolean(rootModelRef) && open },
  )

  const records = recordsQuery.records
  function handlePickerOpenChange(nextOpen: boolean) {
    if (!nextOpen) recordsQuery.setSearch('')
    setOpen(nextOpen)
  }

  const [selectedRecord, setSelectedRecord] = useState<{
    pk: string
    displayName: string
  } | null>(null)
  const { data: selectedRunData, isFetching: isSelectedRunFetching } = useQuery(
    SHARED_GENERATION_QUERIES.run(slug, selectedRecord?.pk ?? ''),
  )

  return (
    <div className="flex h-dvh w-dvw flex-col bg-background text-foreground">
      <header className="relative z-10 flex items-center gap-3 border-b border-border/70 bg-background/90 px-3 py-2 shadow-[0_1px_0_0_color-mix(in_oklab,var(--foreground)_3%,transparent)] backdrop-blur-md">
        <BrandLogo />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[13px] font-semibold text-foreground">
            {template.name || t('builder.header.titlePlaceholder')}
          </h1>
        </div>
        <DeleteGenerationTemplateButton template={template} />
      </header>

      <main className="relative isolate flex flex-1 items-center justify-center overflow-hidden p-6">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-32 left-1/2 -z-10 size-96 -translate-x-1/2 rounded-full bg-brand/8 blur-3xl dark:bg-brand/10"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-28 bottom-0 -z-10 size-72 rounded-full bg-canvas-edge/6 blur-3xl dark:bg-canvas-edge/8"
        />
        <div className="w-full max-w-md space-y-6 rounded-2xl border border-border/70 bg-card/90 p-6 shadow-[0_18px_55px_-36px_color-mix(in_oklab,var(--foreground)_35%,transparent)] backdrop-blur-sm dark:bg-secondary/20 dark:shadow-black/30 sm:p-7">
          <div className="space-y-2 text-center">
            <h2 className="text-lg font-semibold text-foreground">
              {template.name || t('builder.header.titlePlaceholder')}
            </h2>
            <p className="text-[13px] text-muted-foreground">
              {t('generate.selectRecord')}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Popover open={open} onOpenChange={handlePickerOpenChange}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={open}
                  aria-controls="generate-record-list"
                  className="min-w-0 flex-1 justify-between bg-background/70 font-normal shadow-none dark:bg-background/55"
                >
                  {selectedRecord ? (
                    <span className="truncate">
                      {selectedRecord.displayName}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">
                      {t('generate.recordPlaceholder')}
                    </span>
                  )}
                  <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder={t('generate.searchRecords')}
                    value={recordsQuery.search}
                    onValueChange={recordsQuery.setSearch}
                  />
                  <CommandList id="generate-record-list">
                    {recordsQuery.isLoading && (
                      <CommandLoading>
                        <Loader2 className="size-4 animate-spin" />
                        {t('generate.loadingRecords')}
                      </CommandLoading>
                    )}
                    {recordsQuery.isError && (
                      <div className="py-6 text-center text-[13px] text-destructive">
                        {t('generate.loadError')}
                      </div>
                    )}
                    {!recordsQuery.isLoading && (
                      <CommandEmpty>{t('generate.noRecords')}</CommandEmpty>
                    )}
                    {records.length > 0 && (
                      <CommandGroup>
                        {records.map((record) => {
                          const pk = getRecordPk(record.fields)
                          const isSelected = selectedRecord?.pk === pk

                          return (
                            <CommandItem
                              key={pk}
                              value={`${record.displayName} ${pk}`}
                              onSelect={() => {
                                setSelectedRecord({
                                  pk,
                                  displayName: record.displayName,
                                })
                                handlePickerOpenChange(false)
                              }}
                            >
                              {isSelected ? (
                                <Check className="size-4 text-brand" />
                              ) : (
                                <Search className="size-4 opacity-0" />
                              )}
                              <span className="min-w-0 flex-1 truncate">
                                {record.displayName}
                              </span>
                              <span className="font-mono text-[10.5px] text-muted-foreground">
                                {pk}
                              </span>
                            </CommandItem>
                          )
                        })}
                      </CommandGroup>
                    )}
                    {recordsQuery.hasNextPage && (
                      <CommandItem
                        forceMount
                        value="__load-more-generate-records"
                        disabled={recordsQuery.isFetchingNextPage}
                        onSelect={() => void recordsQuery.fetchNextPage()}
                      >
                        {recordsQuery.isFetchingNextPage ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Search className="size-4" />
                        )}
                        {recordsQuery.isFetchingNextPage
                          ? t('generate.loadingMoreRecords')
                          : t('generate.loadMoreRecords')}
                      </CommandItem>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            {selectedRecord ? (
              <Button
                asChild
                className="bg-brand text-brand-foreground shadow-sm hover:bg-brand/90 hover:text-brand-foreground"
              >
                <Link
                  to="/generate/$slug/$recordId"
                  params={{ slug, recordId: selectedRecord.pk }}
                >
                  <Play className="size-4" />
                  {t('generate.run')}
                </Link>
              </Button>
            ) : (
              <Button className="bg-brand text-brand-foreground" disabled>
                <Play className="size-4" />
                {t('generate.run')}
              </Button>
            )}
          </div>

          {isSelectedRunFetching ? (
            <p className="text-center text-[12px] text-muted-foreground">
              {t('filterImpact.checking')}
            </p>
          ) : null}
          <FilterImpactNotice
            className="rounded-lg border"
            response={selectedRunData}
          />
        </div>
      </main>
    </div>
  )
}
