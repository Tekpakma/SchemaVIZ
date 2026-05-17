import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  Check,
  Eye,
  EyeOff,
  Loader2,
  Save,
  Search,
  Star,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { SCHEMA_QUERIES } from '@/features/lexical/dataReference/schemaQueries'
import type { BuilderDocumentActions } from '../builderWorkbench'
import type { ExampleRecord, RecipeModel } from '../types'

type BuilderHeaderProps = {
  actions: Pick<
    BuilderDocumentActions,
    'addExample' | 'setActiveExample'
  >
  activeExampleId: string | null
  examples: ExampleRecord[]
  models: RecipeModel[]
  title: string
  onTitleChange: (title: string) => void
}

function getStartModel(models: RecipeModel[]): RecipeModel | undefined {
  return models[0]
}

function getRecordId(fields: Record<string, unknown>): string {
  const pk = fields.pk ?? fields.id ?? ''
  return String(pk)
}

export function BuilderHeader({
  actions,
  activeExampleId,
  examples,
  models,
  onTitleChange,
  title,
}: BuilderHeaderProps) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [pickerOpen, setPickerOpen] = useState(false)

  const startModel = getStartModel(models)
  const isPreviewActive = activeExampleId != null
  const activeExample = activeExampleId
    ? examples.find((ex) => ex.id === activeExampleId)
    : null

  const existingIds = useMemo(
    () => new Set(examples.map((ex) => ex.idValue)),
    [examples],
  )

  const recordsQuery = useQuery({
    ...SCHEMA_QUERIES.records({
      appLabel: startModel?.appLabel ?? '',
      modelName: startModel?.modelName ?? '',
      page: 1,
      pageSize: 50,
    }),
    enabled: pickerOpen && !!startModel,
  })

  const records = recordsQuery.data?.results ?? []

  const handlePreviewToggle = useCallback(() => {
    if (isPreviewActive) {
      // Turn off preview
      actions.setActiveExample(null)
    } else if (startModel) {
      // Open picker to select a record
      setPickerOpen(true)
    }
  }, [actions, isPreviewActive, startModel])

  const handlePickExistingExample = useCallback(
    (exampleId: string) => {
      actions.setActiveExample(exampleId)
      setPickerOpen(false)
    },
    [actions],
  )

  const handlePickNewRecord = useCallback(
    (record: ExampleRecord) => {
      actions.addExample(record)
      actions.setActiveExample(record.id)
      setPickerOpen(false)
    },
    [actions],
  )

  return (
    <>
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-[13px] text-muted-foreground"
          onClick={() => navigate({ to: '/' })}
        >
          <ArrowLeft className="size-3.5" />
          {t('builder.header.back')}
        </Button>

        <Input
          aria-label={t('builder.header.titleLabel')}
          className="h-8 min-w-0 flex-1 border-none bg-transparent px-0 text-[14px] font-semibold shadow-none focus-visible:ring-0"
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
          placeholder={t('builder.header.titlePlaceholder')}
        />

        <div className="flex items-center gap-2">
          {isPreviewActive && activeExample && (
            <span className="rounded-full bg-brand/15 px-2.5 py-1 text-[11px] font-medium text-brand">
              {activeExample.label}
            </span>
          )}
          <Button
            variant={isPreviewActive ? 'default' : 'ghost'}
            size="sm"
            className="gap-1.5 text-[13px]"
            disabled={!startModel}
            onClick={handlePreviewToggle}
          >
            {isPreviewActive ? (
              <EyeOff className="size-3.5" />
            ) : (
              <Eye className="size-3.5" />
            )}
            {t('builder.header.preview')}
          </Button>
          <Button variant="ghost" size="sm" className="gap-1.5 text-[13px]">
            <Save className="size-3.5" />
            {t('builder.header.save')}
          </Button>
          <Button size="sm" className="gap-1.5 text-[13px]">
            <Star className="size-3.5" />
            {t('builder.header.promote')}
          </Button>
        </div>
      </header>

      {startModel && (
        <CommandDialog
          title={t('builder.header.previewPickerTitle')}
          description={t('builder.header.previewPickerDescription', {
            model: startModel.displayName,
          })}
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          showCloseButton={false}
        >
          <CommandInput
            placeholder={t('builder.header.previewPickerSearch')}
          />
          <CommandList>
            {/* Show already-pinned examples first */}
            {examples.length > 0 && (
              <CommandGroup heading={t('builder.header.pinnedRecords')}>
                {examples.map((ex) => (
                  <CommandItem
                    key={ex.id}
                    value={`${ex.label} ${ex.idValue}`}
                    onSelect={() => handlePickExistingExample(ex.id)}
                  >
                    {activeExampleId === ex.id ? (
                      <Eye className="size-4 text-brand" />
                    ) : (
                      <Check className="size-4 text-muted-foreground" />
                    )}
                    <span className="min-w-0 flex-1 truncate">{ex.label}</span>
                    <span className="font-mono text-[10.5px] text-muted-foreground">
                      {ex.idValue}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {/* Backend records for the start model */}
            {recordsQuery.isLoading && (
              <div className="flex items-center justify-center gap-2 py-6 text-[13px] text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                {t('builder.header.loadingRecords')}
              </div>
            )}
            <CommandEmpty>
              {t('builder.header.noRecordsFound')}
            </CommandEmpty>
            {records.length > 0 && (
              <CommandGroup heading={startModel.displayName}>
                {records.map((record) => {
                  const recordId = getRecordId(record.fields)
                  const idValue = `${startModel.appLabel}:${recordId}`
                  const isAdded = existingIds.has(idValue)

                  return (
                    <CommandItem
                      key={idValue}
                      value={`${record.displayName} ${idValue}`}
                      onSelect={() => {
                        if (isAdded) {
                          // Already pinned — just activate it
                          const existing = examples.find(
                            (ex) => ex.idValue === idValue,
                          )
                          if (existing) {
                            handlePickExistingExample(existing.id)
                          }
                        } else {
                          handlePickNewRecord({
                            id: `ex-${startModel.modelName}-${recordId}`,
                            label: record.displayName,
                            kind: startModel.displayName,
                            idValue,
                            isDefault: examples.length === 0,
                          })
                        }
                      }}
                    >
                      {isAdded ? (
                        <Check className="size-4 text-brand" />
                      ) : (
                        <Search className="size-4" />
                      )}
                      <span className="min-w-0 flex-1 truncate">
                        {record.displayName}
                      </span>
                      <span className="font-mono text-[10.5px] text-muted-foreground">
                        {idValue}
                      </span>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            )}
          </CommandList>
        </CommandDialog>
      )}
    </>
  )
}
