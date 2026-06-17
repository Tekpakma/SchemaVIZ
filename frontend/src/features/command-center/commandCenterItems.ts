import {
  Bot,
  Boxes,
  FilePlus2,
  GitFork,
  Map,
  Network,
  PenLine,
  Route,
  Search,
  Sparkles,
  Wand2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import type {
  Drawing,
  GenerationTemplateList,
  ModelInfo,
} from '@/api/contracts'

export type CommandCenterMode = 'search' | 'ai'

export type CommandCenterActionId =
  | 'create-freedraw'
  | 'open-schema-discovery'
  | 'create-template'
  | 'generate-from-template'
  | 'ai-ask'
  | 'ai-explain-schema'
  | 'ai-create-draft'
  | 'ai-suggest-traversal'
  | 'ai-find-relationships'

export type CommandCenterItemKind = 'action' | 'template' | 'drawing' | 'model'

export type CommandCenterRouteTarget =
  | {
      to: '/'
    }
  | {
      to: '/freedraw'
      search?: {
        drawingId?: string
      }
    }
  | {
      to: '/schema-discovery'
      search?: {
        model?: string
      }
    }
  | {
      to: '/builder'
      search?: {
        templateId?: string
      }
    }
  | {
      to: '/generate/$slug'
      params: {
        slug: string
      }
    }

export type CommandCenterItem = {
  id: string
  kind: CommandCenterItemKind
  group: 'workflows' | 'templates' | 'drawings' | 'models' | 'ai'
  title: string
  subtitle: string
  icon: LucideIcon
  keywords: string[]
  actionId?: CommandCenterActionId
  route?: CommandCenterRouteTarget
}

export const COMMAND_CENTER_ROUTE_TARGETS = {
  freedraw: { to: '/freedraw' } satisfies CommandCenterRouteTarget,
  schemaDiscovery: {
    to: '/schema-discovery',
  } satisfies CommandCenterRouteTarget,
  builder: { to: '/builder' } satisfies CommandCenterRouteTarget,
} as const

export const SEARCH_ACTIONS: CommandCenterItem[] = [
  {
    id: 'action:create-freedraw',
    kind: 'action',
    group: 'workflows',
    title: 'Create freedraw',
    subtitle: 'Open a focused canvas workspace',
    icon: PenLine,
    keywords: ['canvas', 'drawing', 'landscape', 'diagram'],
    actionId: 'create-freedraw',
    route: COMMAND_CENTER_ROUTE_TARGETS.freedraw,
  },
  {
    id: 'action:open-schema-discovery',
    kind: 'action',
    group: 'workflows',
    title: 'Open schema discovery',
    subtitle: 'Explore Django models and relations',
    icon: Network,
    keywords: ['schema', 'models', 'relations', 'graph'],
    actionId: 'open-schema-discovery',
    route: COMMAND_CENTER_ROUTE_TARGETS.schemaDiscovery,
  },
  {
    id: 'action:create-template',
    kind: 'action',
    group: 'workflows',
    title: 'Create template',
    subtitle: 'Start a builder draft',
    icon: FilePlus2,
    keywords: ['builder', 'draft', 'generation', 'recipe'],
    actionId: 'create-template',
    route: COMMAND_CENTER_ROUTE_TARGETS.builder,
  },
  {
    id: 'action:generate-from-template',
    kind: 'action',
    group: 'workflows',
    title: 'Generate from template',
    subtitle: 'Find a published template to run',
    icon: Wand2,
    keywords: ['run', 'generate', 'template', 'record'],
    actionId: 'generate-from-template',
    route: { to: '/' },
  },
]

export const AI_ACTIONS: CommandCenterItem[] = [
  {
    id: 'ai:ask',
    kind: 'action',
    group: 'ai',
    title: 'Ask AI',
    subtitle: 'Ask about the current schema or workflow',
    icon: Bot,
    keywords: ['chat', 'assistant', 'question'],
    actionId: 'ai-ask',
  },
  {
    id: 'ai:explain-schema',
    kind: 'action',
    group: 'ai',
    title: 'Explain schema',
    subtitle: 'Summarize models, fields, and relations',
    icon: Search,
    keywords: ['model', 'field', 'relation'],
    actionId: 'ai-explain-schema',
    route: COMMAND_CENTER_ROUTE_TARGETS.schemaDiscovery,
  },
  {
    id: 'ai:create-draft',
    kind: 'action',
    group: 'ai',
    title: 'Create draft',
    subtitle: 'Turn an idea into a builder draft',
    icon: Sparkles,
    keywords: ['builder', 'template', 'draft'],
    actionId: 'ai-create-draft',
    route: COMMAND_CENTER_ROUTE_TARGETS.builder,
  },
  {
    id: 'ai:suggest-traversal',
    kind: 'action',
    group: 'ai',
    title: 'Suggest traversal',
    subtitle: 'Find useful relationship paths',
    icon: Route,
    keywords: ['path', 'route', 'relations'],
    actionId: 'ai-suggest-traversal',
    route: COMMAND_CENTER_ROUTE_TARGETS.schemaDiscovery,
  },
  {
    id: 'ai:find-relationships',
    kind: 'action',
    group: 'ai',
    title: 'Find relationships',
    subtitle: 'Search for related models and records',
    icon: GitFork,
    keywords: ['schema', 'model', 'records'],
    actionId: 'ai-find-relationships',
    route: COMMAND_CENTER_ROUTE_TARGETS.schemaDiscovery,
  },
]

function normalizeSearch(value: string) {
  return value.trim().toLowerCase()
}

export function matchesCommandCenterItem(
  item: CommandCenterItem,
  query: string,
) {
  const normalizedQuery = normalizeSearch(query)
  if (!normalizedQuery) return true

  const haystack = [
    item.title,
    item.subtitle,
    item.kind,
    item.group,
    ...item.keywords,
  ]
    .join(' ')
    .toLowerCase()

  return haystack.includes(normalizedQuery)
}

export function filterCommandCenterItems(
  items: CommandCenterItem[],
  query: string,
) {
  return items.filter((item) => matchesCommandCenterItem(item, query))
}

export function createTemplateCommandItems(
  templates: GenerationTemplateList[],
): CommandCenterItem[] {
  return templates.map((template) => {
    const publishedRoute =
      template.shareSlug && template.publishedVersion
        ? ({
            to: '/generate/$slug',
            params: {
              slug: template.shareSlug,
            },
          } satisfies CommandCenterRouteTarget)
        : null

    return {
      id: `template:${template.id}`,
      kind: 'template',
      group: 'templates',
      title: template.name,
      subtitle: template.rootModel,
      icon: Boxes,
      keywords: [
        'template',
        'generation',
        template.rootModel,
        template.scope,
        template.description ?? '',
      ],
      route:
        publishedRoute ??
        ({
          to: '/builder',
          search: {
            templateId: template.id,
          },
        } satisfies CommandCenterRouteTarget),
    }
  })
}

export function createDrawingCommandItems(
  drawings: Drawing[],
): CommandCenterItem[] {
  return drawings.map((drawing) => ({
    id: `drawing:${drawing.id ?? drawing.title}`,
    kind: 'drawing',
    group: 'drawings',
    title: drawing.title,
    subtitle: drawing.description || 'Freedraw landscape',
    icon: Map,
    keywords: ['drawing', 'freedraw', 'landscape', drawing.description ?? ''],
    route: {
      to: '/freedraw',
      search: drawing.id
        ? {
            drawingId: drawing.id,
          }
        : undefined,
    },
  }))
}

export function getModelId(model: ModelInfo) {
  return `${model.appLabel}.${model.modelName}`
}

export function createModelCommandItems(
  models: ModelInfo[],
): CommandCenterItem[] {
  return models.map((model) => {
    const modelId = getModelId(model)
    return {
      id: `model:${modelId}`,
      kind: 'model',
      group: 'models',
      title: model.verboseName,
      subtitle: modelId,
      icon: Network,
      keywords: [
        'django',
        'model',
        'schema',
        model.modelName,
        model.appLabel,
        model.appVerboseName,
        model.verboseNamePlural,
      ],
      route: {
        to: '/schema-discovery',
        search: {
          model: modelId,
        },
      },
    }
  })
}

export function shouldToggleCommandCenter(event: KeyboardEvent) {
  const key = event.key.toLowerCase()
  return key === 'k' && (event.ctrlKey || event.metaKey) && !event.shiftKey
}
