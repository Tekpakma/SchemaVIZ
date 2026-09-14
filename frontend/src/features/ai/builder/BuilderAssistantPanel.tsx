import { useMemo, useRef, useState } from 'react'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import type { UIMessage } from '@tanstack/ai'
import {
  AlertCircle,
  Check,
  Loader2,
  SendHorizontal,
  Sparkles,
  Square,
  Trash2,
  X,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ParseKeys, TFunction } from 'i18next'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { BuilderDocumentActions } from '@/features/builder/builderWorkbench'
import type { RecipeData } from '@/features/builder/types'

import { buildDiagramSnapshot } from './assistantState'
import { createBuilderClientTools } from './builderClientTools'

type BuilderAssistantPanelProps = {
  actions: BuilderDocumentActions
  activeExampleId: string | null
  getRecipe: () => RecipeData
  recipe: RecipeData
  onClose: () => void
}

const SUGGESTION_KEYS = [
  'assistant.suggestions.landscape',
  'assistant.suggestions.record',
  'assistant.suggestions.trim',
] as const satisfies ReadonlyArray<ParseKeys>

const TOOL_LABEL_KEYS: Partial<Record<string, ParseKeys>> = {
  applyDiagramSpec: 'assistant.tools.applyDiagramSpec',
  findRecords: 'assistant.tools.findRecords',
  getModelDetails: 'assistant.tools.getModelDetails',
  getRecord: 'assistant.tools.getRecord',
  getSchemaDigest: 'assistant.tools.getSchemaDigest',
  listModels: 'assistant.tools.listModels',
  removeModels: 'assistant.tools.removeModels',
  setLayoutDirection: 'assistant.tools.setLayoutDirection',
  setRootRecord: 'assistant.tools.setRootRecord',
  suggestDiagram: 'assistant.tools.suggestDiagram',
  validateDiagram: 'assistant.tools.validateDiagram',
}

function toolLabel(t: TFunction, name: string) {
  const key = TOOL_LABEL_KEYS[name]
  return key ? t(key) : name
}

type MessagePart = UIMessage['parts'][number]

function ToolCallChip({
  part,
}: {
  part: Extract<MessagePart, { type: 'tool-call' }>
}) {
  const { t } = useTranslation()
  const done = part.state === 'complete'
  const failed = part.state === 'error'
  const label = toolLabel(t, part.name)
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]',
        failed
          ? 'border-destructive/30 bg-destructive/10 text-destructive'
          : 'border-border bg-muted text-muted-foreground',
      )}
      title={label}
    >
      {failed ? (
        <AlertCircle className="size-3" />
      ) : done ? (
        <Check className="size-3" />
      ) : (
        <Loader2 className="size-3 animate-spin" />
      )}
      {label}
    </span>
  )
}

function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === 'user'
  const text = message.parts
    .filter(
      (part): part is Extract<MessagePart, { type: 'text' }> =>
        part.type === 'text',
    )
    .map((part) => part.content)
    .join('')
  const toolCalls = message.parts.filter(
    (part): part is Extract<MessagePart, { type: 'tool-call' }> =>
      part.type === 'tool-call',
  )

  if (!text && toolCalls.length === 0) return null

  return (
    <div className={cn('flex flex-col gap-1.5', isUser && 'items-end')}>
      {toolCalls.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {toolCalls.map((part) => (
            <ToolCallChip key={part.id} part={part} />
          ))}
        </div>
      )}
      {text && (
        <div
          className={cn(
            'max-w-[92%] whitespace-pre-wrap rounded-lg px-3 py-2 text-[13px] leading-relaxed',
            isUser
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-foreground',
          )}
        >
          {text}
        </div>
      )}
    </div>
  )
}

export function BuilderAssistantPanel({
  actions,
  activeExampleId,
  getRecipe,
  recipe,
  onClose,
}: BuilderAssistantPanelProps) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  // The builder recreates `actions` on every recipe change; the chat client
  // must keep one tool array, so the tools call through a ref instead.
  const actionsRef = useRef(actions)
  actionsRef.current = actions
  const tools = useMemo(
    () =>
      createBuilderClientTools({
        getRecipe,
        actions: {
          addEdge: (edge) => actionsRef.current.addEdge(edge),
          addExample: (example) => actionsRef.current.addExample(example),
          addGroupRule: (rule) => actionsRef.current.addGroupRule(rule),
          addLayer: (layer) => actionsRef.current.addLayer(layer),
          addModel: (model) => actionsRef.current.addModel(model),
          removeModel: (id) => actionsRef.current.removeModel(id),
          setActiveExample: (id) => actionsRef.current.setActiveExample(id),
          setEdgeLabels: (mode) => actionsRef.current.setEdgeLabels(mode),
          setLayoutDirection: (direction) =>
            actionsRef.current.setLayoutDirection(direction),
          setStyleDraft: (modelId, styleDraft) =>
            actionsRef.current.setStyleDraft(modelId, styleDraft),
          setTitle: (title) => actionsRef.current.setTitle(title),
        },
      }),
    [getRecipe],
  )
  const connection = useMemo(
    () =>
      fetchServerSentEvents('/api/ai/chat', () => ({
        credentials: 'same-origin',
      })),
    [],
  )

  const { messages, sendMessage, isLoading, error, stop, clear } = useChat({
    connection,
    tools,
  })

  async function submit(content: string) {
    const trimmed = content.trim()
    if (!trimmed || isLoading) return
    setDraft('')
    await sendMessage(trimmed, {
      body: { diagram: buildDiagramSnapshot(getRecipe(), activeExampleId) },
    })
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }

  const rootLabel = recipe.models[0]?.displayName

  return (
    <aside
      aria-label={t('assistant.title')}
      className="flex h-full min-h-0 w-[360px] shrink-0 flex-col overflow-hidden border-l border-border bg-background"
    >
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
        <Sparkles className="size-4 text-brand" />
        <h2 className="flex-1 text-[13px] font-semibold">
          {t('assistant.title')}
        </h2>
        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('assistant.clear')}
            title={t('assistant.clear')}
            onClick={clear}
          >
            <Trash2 className="size-3.5" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t('assistant.close')}
          title={t('assistant.close')}
          onClick={onClose}
        >
          <X className="size-3.5" />
        </Button>
      </div>

      <div
        ref={listRef}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3"
      >
        {messages.length === 0 ? (
          <div className="space-y-3">
            <p className="text-[12.5px] leading-relaxed text-muted-foreground">
              {t('assistant.intro')}
            </p>
            <div className="flex flex-col gap-1.5">
              {SUGGESTION_KEYS.map((key) => {
                const suggestion = t(key, {
                  model: rootLabel ?? t('assistant.rootPlaceholder'),
                })
                return (
                  <button
                    key={key}
                    type="button"
                    className="rounded-md border border-border px-3 py-2 text-left text-[12.5px] transition-colors hover:bg-accent"
                    onClick={() => setDraft(suggestion)}
                  >
                    {suggestion}
                  </button>
                )
              })}
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))
        )}
        {error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12.5px] text-destructive">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
            <span>{error.message || t('assistant.error')}</span>
          </div>
        )}
      </div>

      <form
        className="shrink-0 border-t border-border p-3"
        onSubmit={(event) => {
          event.preventDefault()
          void submit(draft)
        }}
      >
        <Textarea
          aria-label={t('assistant.inputLabel')}
          className="min-h-[72px] resize-none text-[13px]"
          placeholder={t('assistant.placeholder')}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void submit(draft)
            }
          }}
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">
            {t('assistant.hint')}
          </span>
          {isLoading ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 text-[12.5px]"
              onClick={stop}
            >
              <Square className="size-3" />
              {t('assistant.stop')}
            </Button>
          ) : (
            <Button
              type="submit"
              size="sm"
              className="gap-1.5 text-[12.5px]"
              disabled={!draft.trim()}
            >
              <SendHorizontal className="size-3.5" />
              {t('assistant.send')}
            </Button>
          )}
        </div>
      </form>
    </aside>
  )
}
