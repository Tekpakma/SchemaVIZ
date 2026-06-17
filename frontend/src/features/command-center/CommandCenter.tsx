import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Bot, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { cn } from '@/lib/utils'
import {
  AI_ACTIONS,
  SEARCH_ACTIONS,
  createDrawingCommandItems,
  createModelCommandItems,
  createTemplateCommandItems,
  filterCommandCenterItems,
  shouldToggleCommandCenter,
} from './commandCenterItems'
import type { CommandCenterItem, CommandCenterMode } from './commandCenterItems'
import { COMMAND_CENTER_QUERIES } from './commandCenterQueries'

type CommandCenterProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const GROUP_ORDER: CommandCenterItem['group'][] = [
  'workflows',
  'templates',
  'drawings',
  'models',
  'ai',
]

export function CommandCenter({ open, onOpenChange }: CommandCenterProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [mode, setMode] = useState<CommandCenterMode>('search')
  const [query, setQuery] = useState('')

  const templatesQuery = useQuery(COMMAND_CENTER_QUERIES.templates(open))
  const drawingsQuery = useQuery(COMMAND_CENTER_QUERIES.drawings(open))
  const modelsQuery = useQuery(COMMAND_CENTER_QUERIES.models(open))

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!shouldToggleCommandCenter(event)) return
      event.preventDefault()
      onOpenChange(!open)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onOpenChange, open])

  const searchItems = useMemo(
    () => [
      ...SEARCH_ACTIONS,
      ...createTemplateCommandItems(templatesQuery.data ?? []),
      ...createDrawingCommandItems(drawingsQuery.data ?? []),
      ...createModelCommandItems(modelsQuery.data ?? []),
    ],
    [drawingsQuery.data, modelsQuery.data, templatesQuery.data],
  )

  const activeItems = mode === 'search' ? searchItems : AI_ACTIONS
  const filteredItems = filterCommandCenterItems(activeItems, query)

  function closeDialog() {
    setQuery('')
    onOpenChange(false)
  }

  function runItem(item: CommandCenterItem) {
    if (item.id === 'ai:ask') {
      setMode('ai')
      return
    }

    if (!item.route) return

    closeDialog()

    switch (item.route.to) {
      case '/':
        navigate({ to: '/' })
        break
      case '/freedraw':
        navigate({ to: '/freedraw', search: item.route.search ?? {} })
        break
      case '/schema-discovery':
        navigate({ to: '/schema-discovery', search: item.route.search ?? {} })
        break
      case '/builder':
        navigate({ to: '/builder', search: item.route.search ?? {} })
        break
      case '/generate/$slug':
        navigate({
          to: '/generate/$slug',
          params: item.route.params,
        })
        break
    }
  }

  const hasLoadingSources =
    mode === 'search' &&
    (templatesQuery.isLoading ||
      drawingsQuery.isLoading ||
      modelsQuery.isLoading)

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('commandCenter.title')}
      description={t('commandCenter.description')}
      className="top-16 max-h-[calc(100dvh-5rem)] translate-y-0 gap-0 rounded-lg border shadow-lg sm:top-[12vh] sm:max-w-2xl"
    >
      <div className="flex items-center gap-1 border-b px-2 py-2">
        <ModeButton
          active={mode === 'search'}
          icon={Search}
          label={t('commandCenter.modes.search')}
          onClick={() => setMode('search')}
        />
        <ModeButton
          active={mode === 'ai'}
          icon={Bot}
          label={t('commandCenter.modes.ai')}
          onClick={() => setMode('ai')}
        />
      </div>

      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder={
          mode === 'search'
            ? t('commandCenter.searchPlaceholder')
            : t('commandCenter.aiPlaceholder')
        }
      />

      <CommandList className="max-h-[min(460px,54vh)]">
        <CommandEmpty>
          {hasLoadingSources
            ? t('commandCenter.loading')
            : t('commandCenter.empty')}
        </CommandEmpty>
        {mode === 'ai' && query.trim() ? (
          <>
            <CommandGroup heading={t('commandCenter.groups.ai')}>
              <CommandItem
                value={`${query} ask ai`}
                onSelect={() => setQuery('')}
                className="items-start gap-3"
              >
                <Bot className="mt-0.5 size-4" />
                <ItemCopy
                  title={t('commandCenter.aiPromptTitle', { query })}
                  subtitle={t('commandCenter.aiPromptSubtitle')}
                />
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
          </>
        ) : null}
        {GROUP_ORDER.map((group) => {
          const groupItems = filteredItems.filter(
            (item) => item.group === group,
          )
          if (!groupItems.length) return null

          return (
            <CommandGroup
              key={group}
              heading={t(`commandCenter.groups.${group}`)}
            >
              {groupItems.map((item) => (
                <CommandItem
                  key={item.id}
                  value={[
                    item.title,
                    item.subtitle,
                    item.kind,
                    ...item.keywords,
                  ].join(' ')}
                  onSelect={() => runItem(item)}
                  className="items-start gap-3"
                >
                  <item.icon className="mt-0.5 size-4" />
                  <ItemCopy title={item.title} subtitle={item.subtitle} />
                </CommandItem>
              ))}
            </CommandGroup>
          )
        })}
      </CommandList>
    </CommandDialog>
  )
}

type ModeButtonProps = {
  active: boolean
  icon: typeof Search
  label: string
  onClick: () => void
}

function ModeButton({ active, icon: Icon, label, onClick }: ModeButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
        active && 'bg-accent text-foreground',
      )}
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  )
}

type ItemCopyProps = {
  title: string
  subtitle: string
}

function ItemCopy({ title, subtitle }: ItemCopyProps) {
  return (
    <span className="min-w-0">
      <span className="block truncate font-medium">{title}</span>
      <span className="block truncate text-xs text-muted-foreground">
        {subtitle}
      </span>
    </span>
  )
}
