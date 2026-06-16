import { useState } from 'react'
import {
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  Loader2,
  Pencil,
  Search,
  X,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { SCHEMA_QUERIES } from '@/features/lexical/dataReference/schemaQueries'
import { splitModelId } from '@/features/lexical/dataReference/modelUtils'
import { cn } from '@/lib/utils'
import { TemplatePreviewCanvas } from './TemplatePreviewCanvas'
import type { HomeTemplatePreview } from './types'

type TemplateDetailPanelProps = {
  className?: string
  onClose: () => void
  onEdit: (template: HomeTemplatePreview) => void
  onOpen: (template: HomeTemplatePreview) => void
  onPickRecord: (template: HomeTemplatePreview, recordId: string) => void
  template: HomeTemplatePreview
}

function buildGenerationUrl(
  shareSlug: string | null | undefined,
  recordId: string | null,
) {
  if (!shareSlug || typeof window === 'undefined') return null
  const base = `/generate/${shareSlug}/`
  const path = recordId ? `${base}${recordId}/` : base
  return new URL(path, window.location.origin).href
}

function getRecordId(fields: Record<string, unknown>) {
  const pk = fields.pk ?? fields.id ?? ''
  return String(pk)
}

function canEditTemplate(template: HomeTemplatePreview) {
  return template.template.ownedByCurrentUser
}

export function TemplateDetailPanel({
  className,
  onClose,
  onEdit,
  onOpen,
  onPickRecord,
  template,
}: TemplateDetailPanelProps) {
  const { t } = useTranslation()
  const [copiedUrl, setCopiedUrl] = useState(false)
  const [recordPickerOpen, setRecordPickerOpen] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<{
    id: string
    label: string
  } | null>(null)

  const selectedRecordId = selectedRecord?.id ?? template.sampleRecordId
  const selectedRecordLabel =
    selectedRecord?.label ?? template.sampleRecordDisplayName
  const generationUrl = buildGenerationUrl(template.shareSlug, selectedRecordId)

  const rootModel = splitModelId(template.rootModel)
  const isEditable = canEditTemplate(template)
  const canPickRecord = Boolean(template.shareSlug && rootModel)

  const { data: recordsData } = useQuery({
    ...SCHEMA_QUERIES.records({
      appLabel: rootModel?.appLabel ?? '',
      modelName: rootModel?.modelName ?? '',
      page: 1,
      pageSize: 50,
    }),
    enabled: recordPickerOpen && canPickRecord,
  })
  const records = recordsData?.results ?? []

  async function handleCopy() {
    if (!generationUrl) return
    await navigator.clipboard.writeText(generationUrl)
    setCopiedUrl(true)
    setTimeout(() => setCopiedUrl(false), 2000)
  }

  function handleSelectRecord(recordId: string, displayName: string) {
    setSelectedRecord({ id: recordId, label: displayName })
    setRecordPickerOpen(false)
    setCopiedUrl(false)
  }

  function handleOpen() {
    if (selectedRecordId) {
      onPickRecord(template, selectedRecordId)
    } else {
      onOpen(template)
    }
  }

  return (
    <aside
      className={cn(
        'flex h-full w-[380px] shrink-0 flex-col border-l border-border bg-background text-foreground',
        className,
      )}
    >
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
        <h2 className="text-[13px] font-semibold tracking-tight">
          {t('home.detail.title')}
        </h2>
        <Button
          aria-label={t('home.detail.close')}
          size="icon-xs"
          type="button"
          variant="ghost"
          onClick={onClose}
        >
          <X className="size-3.5" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Canvas preview */}
        <div className="border-b border-border bg-muted">
          <TemplatePreviewCanvas
            template={template}
            variant="spotlight"
            className="h-[220px]"
          />
        </div>

        {/* Identity */}
        <div className="px-4 pt-4">
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <span>{t(`home.source.${template.source}`)}</span>
            <span className="h-3 w-px bg-border" />
            <span>{t(`home.status.${template.status}`)}</span>
          </div>
          <h3 className="mt-1.5 text-[18px] font-semibold leading-snug tracking-tight">
            {template.title}
          </h3>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            {template.description}
          </p>

          {/* Inline stats */}
          <div className="mt-2 flex items-center gap-3 text-[12px]">
            <span className="text-foreground">
              <span className="font-semibold">{template.nodeCount}</span>{' '}
              <span className="text-muted-foreground">
                {t('home.detail.nodes')}
              </span>
            </span>
            <span className="h-3 w-px bg-border" />
            <span className="text-foreground">
              <span className="font-semibold">{template.edgeCount}</span>{' '}
              <span className="text-muted-foreground">
                {t('home.detail.edges')}
              </span>
            </span>
          </div>
        </div>

        {/* Generation URL bar */}
        {generationUrl ? (
          <div className="mt-4 px-4">
            {/* Record selector */}
            {canPickRecord ? (
              <button
                type="button"
                onClick={() => setRecordPickerOpen(true)}
                className="mb-2 flex w-full items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <Search className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-[13px]">
                  {selectedRecordLabel ? (
                    <span className="font-medium text-foreground">
                      {selectedRecordLabel}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">
                      {t('home.detail.selectRecord')}
                    </span>
                  )}
                </span>
                <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
              </button>
            ) : null}

            {/* URL + actions */}
            <div className="flex items-center gap-0 rounded-lg border border-border bg-muted/40">
              <div className="min-w-0 flex-1 px-3 py-2">
                <div className="truncate font-mono text-[11px] text-muted-foreground">
                  {generationUrl}
                </div>
              </div>
              <div className="flex shrink-0 border-l border-border">
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex size-8 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  aria-label={t('builder.publish.copy')}
                >
                  {copiedUrl ? (
                    <Check className="size-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleOpen}
                  className="flex size-8 items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  aria-label={t('home.detail.open')}
                >
                  <ExternalLink className="size-3.5" />
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* Actions */}
        <div className="mt-3 flex gap-2 px-4">
          <Button
            className="h-9 flex-1 gap-1.5 rounded-[8px] text-[13px]"
            type="button"
            disabled={!generationUrl}
            onClick={handleOpen}
          >
            <ExternalLink className="size-3.5" />
            {t('home.detail.open')}
          </Button>
          {isEditable ? (
            <Button
              className="h-9 flex-1 gap-1.5 rounded-[8px] text-[12.5px]"
              type="button"
              variant="outline"
              onClick={() => onEdit(template)}
            >
              <Pencil className="size-3" />
              {t('home.detail.editTemplate')}
            </Button>
          ) : null}
        </div>

        {/* Metadata */}
        <div className="mt-4 border-t border-border px-4 py-4">
          <div className="grid gap-2 text-[12px]">
            <MetadataRow
              label={t('home.detail.author')}
              value={template.author}
            />
            <MetadataRow
              label={t('home.detail.rootModel')}
              value={template.rootModel}
              mono
            />
            {selectedRecordLabel ? (
              <MetadataRow
                label={t('home.detail.sampleRecord')}
                value={selectedRecordLabel}
              />
            ) : null}
          </div>
        </div>
      </div>

      {rootModel ? (
        <CommandDialog
          title={t('home.detail.chooseRecord')}
          description={t('home.detail.recordPickerDescription', {
            model: template.rootModel,
            title: template.title,
          })}
          open={recordPickerOpen}
          onOpenChange={setRecordPickerOpen}
          showCloseButton={false}
        >
          <CommandInput placeholder={t('home.detail.searchRecords')} />
          <CommandList>
            {recordsQuery.isLoading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-[13px] text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                {t('home.detail.loadingRecords')}
              </div>
            ) : null}
            <CommandEmpty>{t('home.detail.noRecords')}</CommandEmpty>
            {records.length > 0 ? (
              <CommandGroup heading={template.rootModel}>
                {records.map((record) => {
                  const recordId = getRecordId(record.fields)
                  return (
                    <CommandItem
                      key={recordId}
                      value={`${record.displayName} ${recordId}`}
                      onSelect={() =>
                        handleSelectRecord(recordId, record.displayName)
                      }
                    >
                      <Search className="size-4 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">
                        {record.displayName}
                      </span>
                      <span className="font-mono text-[10.5px] text-muted-foreground">
                        {recordId}
                      </span>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            ) : null}
          </CommandList>
        </CommandDialog>
      ) : null}
    </aside>
  )
}

function MetadataRow({
  label,
  mono = false,
  value,
}: {
  label: string
  mono?: boolean
  value: string
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span
        className={cn(
          'min-w-0 truncate text-right text-foreground',
          mono && 'font-mono text-[11px]',
        )}
      >
        {value}
      </span>
    </div>
  )
}
