import { Suspense, useCallback, useState } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  ArrowLeftIcon,
  BracesIcon,
  ChevronRightIcon,
  DatabaseIcon,
  Loader2Icon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { useOptionalLexicalOverlayRuntime } from '../LexicalOverlayRuntimeContext'
import { INSERT_DATA_REFERENCE_COMMAND } from './commands'
import type { SchemaModelRef } from './schemaQueries'
import type { DataReferenceSuggestion } from './useDataReferenceSuggestions'
import { useDataReferenceSuggestions } from './useDataReferenceSuggestions'

function getParentPath(path: string) {
  const segments = path.replace(/\.$/, '').split('.').filter(Boolean)
  segments.pop()
  return segments.length > 0 ? `${segments.join('.')}.` : ''
}

function DataReferenceBrowserList({
  dataScope,
  onInsert,
  onNavigate,
  path,
}: {
  dataScope: SchemaModelRef
  onInsert: (fieldName: string) => void
  onNavigate: (path: string) => void
  path: string
}) {
  const { t } = useTranslation()
  const suggestions = useDataReferenceSuggestions(dataScope, path, {
    includeRelationRoots: true,
  })
  const fields = suggestions.filter(
    (suggestion) => suggestion.source !== 'relation-root',
  )
  const relations = suggestions.filter(
    (suggestion) => suggestion.source === 'relation-root',
  )

  const renderSuggestion = (suggestion: DataReferenceSuggestion) => {
    const isRelation = suggestion.source === 'relation-root'

    return (
      <button
        key={`${suggestion.source}:${suggestion.fieldName}`}
        type="button"
        className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          if (isRelation) {
            onNavigate(suggestion.fieldName)
          } else {
            onInsert(suggestion.fieldName)
          }
        }}
      >
        {isRelation ? (
          <DatabaseIcon className="size-3.5 shrink-0 text-brand" />
        ) : (
          <BracesIcon className="size-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-medium">
            {isRelation
              ? suggestion.label
              : suggestion.fieldName.split('.').at(-1)}
          </span>
          <span className="block truncate text-[10.5px] text-muted-foreground">
            {isRelation
              ? t('builder.dataReferenceBrowser.openRelation')
              : suggestion.description}
          </span>
        </span>
        {isRelation ? (
          <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground" />
        ) : null}
      </button>
    )
  }

  if (suggestions.length === 0) {
    return (
      <p className="px-2 py-8 text-center text-xs text-muted-foreground">
        {t('builder.dataReferenceBrowser.empty')}
      </p>
    )
  }

  return (
    <div className="max-h-72 overflow-y-auto p-1">
      {fields.length > 0 ? (
        <section>
          <h3 className="px-2 py-1.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
            {t('builder.dataReferenceBrowser.fields')}
          </h3>
          {fields.map(renderSuggestion)}
        </section>
      ) : null}
      {relations.length > 0 ? (
        <section className={cn(fields.length > 0 && 'mt-2 border-t pt-2')}>
          <h3 className="px-2 py-1.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
            {t('builder.dataReferenceBrowser.relations')}
          </h3>
          {relations.map(renderSuggestion)}
        </section>
      ) : null}
    </div>
  )
}

export function DataReferenceBrowser({
  controlClass,
  onInteract,
}: {
  controlClass: string
  onInteract: () => void
}) {
  const [editor] = useLexicalComposerContext()
  const runtime = useOptionalLexicalOverlayRuntime()
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [path, setPath] = useState('')
  const dataScope = runtime?.dataScope

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      onInteract()
      setOpen(nextOpen)
      if (!nextOpen) setPath('')
    },
    [onInteract],
  )

  const insertReference = useCallback(
    (fieldName: string) => {
      onInteract()
      editor.focus(() => {
        editor.dispatchCommand(INSERT_DATA_REFERENCE_COMMAND, fieldName)
      })
      setOpen(false)
      setPath('')
    },
    [editor, onInteract],
  )

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            controlClass,
            'gap-1 px-2 font-sans text-[11px] font-medium',
          )}
          disabled={!dataScope}
          aria-label={t('builder.inlineToolbar.insertData')}
          title={
            dataScope
              ? t('builder.inlineToolbar.insertData')
              : t('builder.inlineToolbar.insertDataUnavailable')
          }
        >
          <DatabaseIcon className="size-3.5" aria-hidden="true" />
          <span>{t('builder.inlineToolbar.insertData')}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 overflow-hidden p-0"
        onFocusCapture={onInteract}
        onPointerDown={onInteract}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          editor.focus()
        }}
      >
        <PopoverHeader className="border-b border-border px-3 py-3">
          <div className="flex items-center gap-2">
            {path ? (
              <button
                type="button"
                className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                aria-label={t('builder.dataReferenceBrowser.back')}
                onClick={() => setPath(getParentPath(path))}
              >
                <ArrowLeftIcon className="size-3.5" />
              </button>
            ) : null}
            <div className="min-w-0">
              <PopoverTitle className="truncate text-[13px]">
                {path
                  ? path.replace(/\.$/, '')
                  : t('builder.dataReferenceBrowser.title')}
              </PopoverTitle>
              <PopoverDescription className="text-[11px]">
                {t('builder.dataReferenceBrowser.description')}
              </PopoverDescription>
            </div>
          </div>
        </PopoverHeader>
        {dataScope ? (
          <Suspense
            fallback={
              <div className="flex items-center justify-center gap-2 px-3 py-10 text-xs text-muted-foreground">
                <Loader2Icon className="size-3.5 animate-spin" />
                {t('builder.dataReferenceBrowser.loading')}
              </div>
            }
          >
            <DataReferenceBrowserList
              dataScope={dataScope}
              onInsert={insertReference}
              onNavigate={setPath}
              path={path}
            />
          </Suspense>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
