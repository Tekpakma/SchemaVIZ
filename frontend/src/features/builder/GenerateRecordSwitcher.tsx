import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Check, ChevronsUpDown, Loader2, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandLoadMore,
  CommandLoading,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { splitModelId } from '@/features/lexical/dataReference/modelUtils'
import { SCHEMA_QUERIES } from '@/features/lexical/dataReference/schemaQueries'
import { usePaginatedRecords } from '@/features/lexical/dataReference/usePaginatedRecords'

interface GenerateRecordSwitcherProps {
  recordId: string
  rootModelId: string
  slug: string
}

function getRecordPk(fields: Record<string, unknown>): string {
  return String(fields.pk ?? fields.id ?? '')
}

export function GenerateRecordSwitcher({
  recordId,
  rootModelId,
  slug,
}: GenerateRecordSwitcherProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  const modelRef = splitModelId(rootModelId)
  const appLabel = modelRef?.appLabel ?? ''
  const modelName = modelRef?.modelName ?? ''

  const recordsQuery = usePaginatedRecords(
    { appLabel, modelName, page: 1 },
    { enabled: Boolean(modelRef) && open },
  )
  const currentRecord = useQuery({
    ...SCHEMA_QUERIES.record({ appLabel, modelName, id: recordId }),
    enabled: Boolean(modelRef && recordId),
  })

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) recordsQuery.setSearch('')
    setOpen(nextOpen)
  }

  function handleSelect(pk: string) {
    handleOpenChange(false)
    if (!pk || pk === recordId) return
    void navigate({
      to: '/generate/$slug/$recordId',
      params: { slug, recordId: pk },
    })
  }

  if (!modelRef) return null

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          aria-expanded={open}
          aria-label={t('generate.switchRecord')}
          className="min-w-0 max-w-56 justify-between bg-background/70 font-normal shadow-none dark:bg-background/55"
          role="combobox"
          size="sm"
          variant="outline"
        >
          <span className="truncate text-[13px]">
            {currentRecord.data?.displayName || recordId}
          </span>
          <ChevronsUpDown className="ml-2 size-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={t('generate.searchRecords')}
            value={recordsQuery.search}
            onValueChange={recordsQuery.setSearch}
          />
          <CommandList>
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
            {recordsQuery.records.length > 0 && (
              <CommandGroup>
                {recordsQuery.records.map((record) => {
                  const pk = getRecordPk(record.fields)

                  return (
                    <CommandItem
                      key={pk}
                      value={`${record.displayName} ${pk}`}
                      onSelect={() => handleSelect(pk)}
                    >
                      {pk === recordId ? (
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
          {recordsQuery.hasNextPage && (
            <CommandLoadMore
              aria-busy={recordsQuery.isFetchingNextPage}
              disabled={recordsQuery.isFetchingNextPage}
              onClick={() => void recordsQuery.fetchNextPage()}
            >
              {recordsQuery.isFetchingNextPage ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Search className="size-4" />
              )}
              {recordsQuery.isFetchingNextPage
                ? t('generate.loadingMoreRecords')
                : t('generate.loadMoreRecords')}
            </CommandLoadMore>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  )
}
