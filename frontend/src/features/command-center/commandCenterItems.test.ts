import { describe, expect, it } from 'vitest'

import type {
  Drawing,
  GenerationTemplateList,
  ModelInfo,
} from '@/api/contracts'
import {
  AI_ACTIONS,
  COMMAND_CENTER_ROUTE_TARGETS,
  SEARCH_ACTIONS,
  createDrawingCommandItems,
  createModelCommandItems,
  createTemplateCommandItems,
  filterCommandCenterItems,
  shouldToggleCommandCenter,
} from './commandCenterItems'

function makeTemplate(
  override: Partial<GenerationTemplateList> = {},
): GenerationTemplateList {
  return {
    id: '018f3b2e-8a9a-7c6d-9e0f-123456789abc',
    name: 'Network landscape',
    description: 'Network relationships',
    rootModel: 'network.Device',
    scope: 'owner',
    ownedByCurrentUser: true,
    featured: {
      enabled: false,
      rank: null,
    },
    shareSlug: null,
    draftVersion: null,
    publishedVersion: null,
    publishedAt: null,
    publishedBy: null,
    createdAt: '2026-06-17T10:00:00+00:00',
    updatedAt: '2026-06-17T10:00:00+00:00',
    revision: 1,
    ...override,
  }
}

describe('command center items', () => {
  it('filters action, template, drawing, and model results by text', () => {
    const items = [
      ...SEARCH_ACTIONS,
      ...createTemplateCommandItems([makeTemplate()]),
      ...createDrawingCommandItems([
        {
          id: '018f3b2e-8a9a-7c6d-9e0f-abcdefabcdef',
          title: 'Rack sketch',
          description: 'Lab landscape',
          createdAt: '2026-06-17T10:00:00+00:00',
          updatedAt: '2026-06-17T10:00:00+00:00',
          revision: 1,
        } satisfies Drawing,
      ]),
      ...createModelCommandItems([
        {
          appLabel: 'inventory',
          appVerboseName: 'Inventory',
          modelName: 'Device',
          verboseName: 'Device',
          verboseNamePlural: 'Devices',
          abstract: false,
          dbTable: 'inventory_device',
          managed: true,
          fields: [],
          relations: [],
          methods: [],
        } satisfies ModelInfo,
      ]),
    ]

    expect(filterCommandCenterItems(items, 'rack')).toHaveLength(1)
    expect(filterCommandCenterItems(items, 'inventory')).toHaveLength(1)
    expect(filterCommandCenterItems(items, 'schema')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'action:open-schema-discovery',
        }),
      ]),
    )
    expect(filterCommandCenterItems(items, 'network')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'template:018f3b2e-8a9a-7c6d-9e0f-123456789abc',
        }),
      ]),
    )
  })

  it('routes workflow actions into focused workspaces', () => {
    expect(COMMAND_CENTER_ROUTE_TARGETS.freedraw.to).toBe('/freedraw')
    expect(COMMAND_CENTER_ROUTE_TARGETS.schemaDiscovery.to).toBe(
      '/schema-discovery',
    )
    expect(COMMAND_CENTER_ROUTE_TARGETS.builder.to).toBe('/builder')
  })

  it('routes generated work from published templates and drafts to builder', () => {
    const [draftItem] = createTemplateCommandItems([makeTemplate()])
    const [publishedItem] = createTemplateCommandItems([
      makeTemplate({
        shareSlug: 'network-landscape',
        publishedVersion: {
          id: '018f3b2e-8a9a-7c6d-9e0f-999999999999',
          versionNumber: 1,
          rootModel: 'network.Device',
          layoutSettings: {},
          createdBy: null,
          createdAt: '2026-06-17T10:00:00+00:00',
          definition: {
            rootStepId: 'root',
            stepsById: {},
          },
        },
      }),
    ])

    expect(draftItem.route).toEqual({
      to: '/builder',
      search: {
        templateId: '018f3b2e-8a9a-7c6d-9e0f-123456789abc',
      },
    })
    expect(publishedItem.route).toEqual({
      to: '/generate/$slug',
      params: {
        slug: 'network-landscape',
      },
    })
  })

  it('keeps AI actions as a command-center mode, not top-level tabs', () => {
    expect(AI_ACTIONS.map((item) => item.actionId)).toEqual([
      'ai-ask',
      'ai-explain-schema',
      'ai-create-draft',
      'ai-suggest-traversal',
      'ai-find-relationships',
    ])
    expect(AI_ACTIONS.every((item) => item.group === 'ai')).toBe(true)
  })

  it('detects Ctrl K and Meta K without hijacking shifted shortcuts', () => {
    expect(
      shouldToggleCommandCenter({
        key: 'k',
        ctrlKey: true,
        metaKey: false,
        shiftKey: false,
      } as KeyboardEvent),
    ).toBe(true)
    expect(
      shouldToggleCommandCenter({
        key: 'K',
        ctrlKey: false,
        metaKey: true,
        shiftKey: false,
      } as KeyboardEvent),
    ).toBe(true)
    expect(
      shouldToggleCommandCenter({
        key: 'k',
        ctrlKey: true,
        metaKey: false,
        shiftKey: true,
      } as KeyboardEvent),
    ).toBe(false)
  })
})
