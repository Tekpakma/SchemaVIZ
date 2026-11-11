import { useQuery } from '@tanstack/react-query'
import { DatabaseIcon, LockIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { START_AUTH_SESSION_QUERY } from '@/api/startAuthSession'
import type { StartAuthSource } from '@/api/startAuthSession'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export function buildSourceSwitchUrl(sourceId: string, next: string): string {
  const params = new URLSearchParams({ source: sourceId, next })
  return `/_schema-viz/auth/source?${params.toString()}`
}

function currentPath(): string {
  if (typeof window === 'undefined') return '/'
  return `${window.location.pathname}${window.location.search}${window.location.hash}`
}

function ReadOnlyTag({ className }: { className?: string }) {
  const { t } = useTranslation()

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-border px-1.5 py-px text-[10.5px] font-medium text-muted-foreground',
        className,
      )}
    >
      <LockIcon className="size-3" />
      {t('source.readOnly')}
    </span>
  )
}

function SourceTags({ source }: { source: StartAuthSource }) {
  const { t } = useTranslation()

  if (!source.isDefault && !source.readOnly) return null

  return (
    <span className="flex shrink-0 items-center gap-1">
      {source.isDefault ? (
        <span className="rounded-full border border-border px-1.5 py-px text-[10.5px] font-medium text-muted-foreground">
          {t('source.default')}
        </span>
      ) : null}
      {source.readOnly ? <ReadOnlyTag /> : null}
    </span>
  )
}

/**
 * Lets the user pick which backend this SchemaViz talks to. It only appears
 * when the deployment lists more than one source.
 */
export function SourcePicker() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const { data: session } = useQuery(START_AUTH_SESSION_QUERY)

  const sources: Array<StartAuthSource> = session?.sources ?? []
  const active = session?.source
  if (!active || sources.length < 2) return null

  function select(source: StartAuthSource) {
    setOpen(false)
    if (source.id === active?.id) return
    window.location.assign(buildSourceSwitchUrl(source.id, currentPath()))
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-2 px-2 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label={t('source.switch')}
        >
          <DatabaseIcon className="size-4" />
          <span className="hidden max-w-40 truncate text-xs sm:inline">
            {active.label}
          </span>
          {active.readOnly ? <LockIcon className="size-3" /> : null}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-72 p-3">
        <div className="space-y-2">
          <div className="text-sm font-medium">{t('source.label')}</div>
          <div className="grid gap-1">
            {sources.map((source) => (
              <Button
                key={source.id}
                variant={source.id === active.id ? 'secondary' : 'ghost'}
                size="sm"
                className="h-auto justify-between gap-2 py-2 text-left"
                aria-current={source.id === active.id}
                onClick={() => select(source)}
              >
                <span className="min-w-0">
                  <span className="block truncate">{source.label}</span>
                  {source.description ? (
                    <span className="block truncate text-xs font-normal text-muted-foreground">
                      {source.description}
                    </span>
                  ) : null}
                </span>
                <SourceTags source={source} />
              </Button>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** A small notice so nobody expects a save to work on a read-only source. */
export function ReadOnlySourceBanner() {
  const { t } = useTranslation()
  const { data: session } = useQuery(START_AUTH_SESSION_QUERY)

  if (!session?.source?.readOnly) return null

  return (
    <div
      role="status"
      className="pointer-events-none fixed bottom-3 left-1/2 z-40 flex max-w-[92vw] -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-background/95 px-3 py-1 text-xs text-muted-foreground shadow-sm"
    >
      <LockIcon className="size-3 shrink-0" />
      <span className="truncate">
        <strong className="font-medium text-foreground">
          {session.source.label}
        </strong>
        {': '}
        {t('source.readOnlyBanner')}
      </span>
    </div>
  )
}
