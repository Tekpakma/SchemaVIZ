import { useState } from 'react'
import {
  Check,
  Eye,
  Loader2,
  MoreHorizontal,
  Search,
  Star,
  Trash2,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandLoading,
} from '@/components/ui/command'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { usePaginatedRecords } from '@/features/lexical/dataReference/usePaginatedRecords'
import type { BuilderDocumentActions } from '../builderWorkbench'
import type { ExampleRecord, RecipeModel } from '../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getStartModel(models: RecipeModel[]): RecipeModel | undefined {
  return models[0]
}

function getRecordId(fields: Record<string, unknown>): string {
  const pk = fields.pk ?? fields.id ?? ''
  return String(pk)
}

// ---------------------------------------------------------------------------
// Record picker dialog — queries the start model's records via backend
// ---------------------------------------------------------------------------

interface RecordPickerDialogProps {
  existingIds: Set<string>
  open: boolean
  onOpenChange: (open: boolean) => void
  onPickRecord: (record: ExampleRecord) => void
  startModel: RecipeModel
}

function RecordPickerDialog({
  existingIds,
  open,
  onOpenChange,
  onPickRecord,
  startModel,
}: RecordPickerDialogProps) {
  const { t } = useTranslation()

  const recordsQuery = usePaginatedRecords({
    appLabel: startModel.appLabel,
    modelName: startModel.modelName,
    page: 1,
  })

  const records = recordsQuery.records
  return (
    <CommandDialog
      title={t('builder.examples.pickerTitle')}
      description={t('builder.examples.pickerDescription', {
        model: startModel.displayName,
      })}
      open={open}
      onOpenChange={onOpenChange}
      showCloseButton={false}
    >
      <CommandInput placeholder={t('builder.examples.pickerSearch')} />
      <CommandList>
        {recordsQuery.isLoading && (
          <CommandLoading>
            <Loader2 className="size-4 animate-spin" />
            {t('builder.examples.loading')}
          </CommandLoading>
        )}
        {recordsQuery.isError && (
          <div className="py-6 text-center text-[13px] text-destructive">
            {t('builder.examples.loadError')}
          </div>
        )}
        <CommandEmpty>{t('builder.examples.empty')}</CommandEmpty>
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
                  disabled={isAdded}
                  onSelect={() => {
                    onPickRecord({
                      id: `ex-${startModel.modelName}-${recordId}`,
                      label: record.displayName,
                      kind: startModel.displayName,
                      idValue,
                      isDefault: false,
                    })
                    onOpenChange(false)
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
        {recordsQuery.hasNextPage && (
          <CommandItem
            forceMount
            value="__load-more-records"
            disabled={recordsQuery.isFetchingNextPage}
            onSelect={() => void recordsQuery.fetchNextPage()}
          >
            {recordsQuery.isFetchingNextPage ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Search className="size-4" />
            )}
            {recordsQuery.isFetchingNextPage
              ? t('builder.examples.loadingMore')
              : t('builder.examples.loadMore')}
          </CommandItem>
        )}
      </CommandList>
    </CommandDialog>
  )
}

// ---------------------------------------------------------------------------
// Example card with context menu + click-to-preview
// ---------------------------------------------------------------------------

interface ExampleCardProps {
  example: ExampleRecord
  isActive: boolean
  onActivate: (id: string | null) => void
  onRemove: (id: string) => void
  onSetDefault: (id: string) => void
}

function ExampleCard({
  example,
  isActive,
  onActivate,
  onRemove,
  onSetDefault,
}: ExampleCardProps) {
  const { t } = useTranslation()

  return (
    <button
      type="button"
      onClick={() => onActivate(isActive ? null : example.id)}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        isActive
          ? 'border-brand bg-brand-muted ring-1 ring-brand/30'
          : example.isDefault
            ? 'border-brand/25 bg-brand-muted hover:border-brand/40'
            : 'border-border bg-card hover:border-muted-foreground/30',
      )}
    >
      {isActive ? (
        <Eye className="size-3.5 shrink-0 text-brand" />
      ) : (
        <span
          className={cn(
            'size-2 shrink-0 rounded-full',
            example.isDefault ? 'bg-brand' : 'bg-muted-foreground/40',
          )}
        />
      )}
      <div className="min-w-0 flex-1">
        <span className="text-[13.5px] font-semibold">{example.label}</span>
        <span className="ml-2 font-mono text-[11px] text-muted-foreground">
          {example.kind} ·{' '}
          <code className="text-[10.5px]">{example.idValue}</code>
        </span>
      </div>
      {example.isDefault && !isActive && (
        <span className="rounded-full bg-brand/15 px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-wider text-brand">
          {t('builder.examples.defaultBadge')}
        </span>
      )}
      {isActive && (
        <span className="rounded-full bg-brand/15 px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-wider text-brand">
          {t('builder.examples.previewBadge')}
        </span>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') e.stopPropagation()
            }}
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={t('builder.examples.openActions', {
              example: example.label,
            })}
          >
            <MoreHorizontal className="size-3.5" />
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {!example.isDefault && (
            <DropdownMenuItem onSelect={() => onSetDefault(example.id)}>
              <Star className="size-3.5" />
              {t('builder.examples.setDefault')}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => onRemove(example.id)}
          >
            <Trash2 className="size-3.5" />
            {t('builder.examples.removeRecord')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

interface ExamplesStepProps {
  actions: Pick<
    BuilderDocumentActions,
    'addExample' | 'removeExample' | 'setActiveExample' | 'setDefaultExample'
  >
  activeExampleId: string | null
  examples: ExampleRecord[]
  models: RecipeModel[]
}

export function ExamplesStep({
  actions,
  activeExampleId,
  examples,
  models,
}: ExamplesStepProps) {
  const { t } = useTranslation()
  const [pickerOpen, setPickerOpen] = useState(false)

  const startModel = getStartModel(models)

  const existingIds = new Set(examples.map((ex) => ex.idValue))

  function handlePickRecord(record: ExampleRecord) {
    const shouldBeDefault = examples.length === 0
    actions.addExample({
      ...record,
      isDefault: shouldBeDefault,
    })
  }

  function handleRemove(id: string) {
    if (activeExampleId === id) {
      actions.setActiveExample(null)
    }
    actions.removeExample(id)
  }

  function handleSetDefault(id: string) {
    actions.setDefaultExample(id)
  }

  function handleActivate(id: string | null) {
    actions.setActiveExample(id)
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[12.5px] leading-relaxed text-muted-foreground">
        {t('builder.examples.descriptionStart')}{' '}
        <b className="text-foreground">
          {t('builder.examples.startingRecord')}
        </b>{' '}
        {t('builder.examples.descriptionEnd')}
      </p>

      {examples.length > 0 && (
        <div className="mt-1 flex flex-col gap-1.5">
          {examples.map((ex) => (
            <ExampleCard
              key={ex.id}
              example={ex}
              isActive={activeExampleId === ex.id}
              onActivate={handleActivate}
              onRemove={handleRemove}
              onSetDefault={handleSetDefault}
            />
          ))}
        </div>
      )}

      {!startModel && (
        <p className="mt-2 text-[12px] text-muted-foreground">
          {t('builder.examples.needsStartModel')}
        </p>
      )}

      {startModel && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-1 self-start text-[13px] text-brand"
          onClick={() => setPickerOpen(true)}
        >
          {t('builder.examples.pinRecord')}
        </Button>
      )}

      {startModel && (
        <RecordPickerDialog
          existingIds={existingIds}
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          onPickRecord={handlePickRecord}
          startModel={startModel}
        />
      )}
    </div>
  )
}
