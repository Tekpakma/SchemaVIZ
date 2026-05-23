import { useMemo, useState } from 'react'
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
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { SHARED_GENERATION_QUERIES } from '@/features/builder/sharedGenerationQueries'
import { FilterImpactNotice } from '@/features/builder/FilterImpactNotice'
import { SCHEMA_QUERIES } from '@/features/lexical/dataReference/schemaQueries'
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
  const rootModelRef = useMemo(
    () => (rootModelId ? splitModelId(rootModelId) : null),
    [rootModelId],
  )

  const recordsQuery = useQuery({
    ...SCHEMA_QUERIES.records({
      appLabel: rootModelRef?.appLabel ?? '',
      modelName: rootModelRef?.modelName ?? '',
      page: 1,
      pageSize: 50,
    }),
    enabled: Boolean(rootModelRef),
  })

  const records = recordsQuery.data?.results ?? []

  const [open, setOpen] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<{
    pk: string
    displayName: string
  } | null>(null)
  const selectedRunQuery = useQuery(
    SHARED_GENERATION_QUERIES.run(slug, selectedRecord?.pk ?? ''),
  )

  return (
    <div className="flex h-dvh w-dvw flex-col bg-background">
      <header className="flex items-center gap-3 border-b border-border px-3 py-2">
        <BrandLogo />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[13px] font-semibold text-foreground">
            {template.name || t('builder.header.titlePlaceholder')}
          </h1>
        </div>
        <DeleteGenerationTemplateButton template={template} />
      </header>

      <main className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md space-y-6">
          <div className="space-y-2 text-center">
            <h2 className="text-lg font-semibold text-foreground">
              {template.name || t('builder.header.titlePlaceholder')}
            </h2>
            <p className="text-[13px] text-muted-foreground">
              {t('generate.selectRecord')}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={open}
                  aria-controls="generate-record-list"
                  className="min-w-0 flex-1 justify-between font-normal"
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
                <Command>
                  <CommandInput placeholder={t('generate.searchRecords')} />
                  <CommandList id="generate-record-list">
                    {recordsQuery.isLoading && (
                      <div className="flex items-center justify-center gap-2 py-6 text-[13px] text-muted-foreground">
                        <Loader2 className="size-4 animate-spin" />
                        {t('generate.loadingRecords')}
                      </div>
                    )}
                    {recordsQuery.isError && (
                      <div className="py-6 text-center text-[13px] text-destructive">
                        {t('generate.loadError')}
                      </div>
                    )}
                    <CommandEmpty>{t('generate.noRecords')}</CommandEmpty>
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
                                setOpen(false)
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
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            {selectedRecord ? (
              <Button asChild>
                <Link
                  to="/generate/$slug/$recordId"
                  params={{ slug, recordId: selectedRecord.pk }}
                >
                  <Play className="size-4" />
                  {t('generate.run')}
                </Link>
              </Button>
            ) : (
              <Button disabled>
                <Play className="size-4" />
                {t('generate.run')}
              </Button>
            )}
          </div>

          {selectedRunQuery.isFetching ? (
            <p className="text-center text-[12px] text-muted-foreground">
              {t('filterImpact.checking')}
            </p>
          ) : null}
          <FilterImpactNotice
            className="rounded-md border border-amber-200 dark:border-amber-900/60"
            response={selectedRunQuery.data}
          />
        </div>
      </main>
    </div>
  )
}
