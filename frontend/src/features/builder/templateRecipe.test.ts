import { describe, expect, it } from 'vitest'

import type { GenerationTemplateRead } from '@/api/contracts'
import { createRecipeFromTemplate, recipeToInlineDefinition } from './templateRecipe'

type GenerationTemplateVersion = NonNullable<
  GenerationTemplateRead['draftVersion']
>

function createTemplate(
  overrides: Partial<GenerationTemplateRead> = {},
): GenerationTemplateRead {
  return {
    id: '018f3b2e-8a9a-7c6d-9e0f-123456789abc',
    name: 'Template',
    description: '',
    rootModel: 'app.Root',
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
    createdAt: '2026-05-13T12:00:00+00:00',
    updatedAt: '2026-05-13T12:00:00+00:00',
    ...overrides,
  }
}

describe('builder template recipe conversion', () => {
  it('uses zod-backed generation definition parsing for builder recipes', () => {
    const recipe = createRecipeFromTemplate(
      createTemplate({
        name: 'Cloud overview',
        scope: 'global',
        draftVersion: {
          id: '018f3b2e-8a9a-7c6d-9e0f-abcdefabcdef',
          versionNumber: 1,
          rootModel: 'cloud.Provider',
          createdBy: null,
          createdAt: '2026-05-13T12:00:00+00:00',
          layoutSettings: {
            layoutAlgorithm: 'Force',
            swatches: ['#111111', '#222222'],
          },
          definition: {
            rootStepId: 'provider',
            stepsById: {
              provider: {
                resolvedModelId: 'cloud.Provider',
                childIds: ['region'],
                label: 'Provider',
              },
              region: {
                parentId: 'provider',
                relationship: 'regions',
                resolvedModelId: 'cloud.Region',
                childIds: [],
                filter: {
                  active: true,
                },
              },
              hidden: {
                resolvedModelId: 'cloud.Hidden',
                visibility: 'hidden',
              },
            },
          },
        },
      }),
    )

    expect(recipe).toMatchObject({
      title: 'Cloud overview',
      layers: [
        {
          id: 'layer-provider',
          label: 'L1',
        },
        {
          id: 'layer-region',
          label: 'L2',
        },
      ],
      models: [
        {
          id: 'provider',
          modelId: 'cloud.Provider',
          displayName: 'Provider',
          layerId: 'layer-provider',
        },
        {
          id: 'region',
          modelId: 'cloud.Region',
          displayName: 'Region',
          layerId: 'layer-region',
        },
      ],
      edges: [
        {
          id: 'edge-region',
          from: 'Provider',
          to: 'Region',
          fromModelId: 'provider',
          toModelId: 'region',
          via: 'regions',
        },
      ],
      filters: [
        {
          id: 'filter-region',
          layer: 'Region',
          expr: '{"active":true}',
        },
      ],
      swatches: ['#111111', '#222222'],
      layoutAlgorithm: 'Force',
      promoteVisibility: 'org-wide',
      promoteAudience: 'All users',
    })
  })

  it('falls back to a blank recipe when unknown template internals do not match the builder schema', () => {
    const recipe = createRecipeFromTemplate(
      createTemplate({
        draftVersion: {
          id: '018f3b2e-8a9a-7c6d-9e0f-fedcbafedcba',
          versionNumber: 1,
          rootModel: 'cloud.Provider',
          createdBy: null,
          createdAt: '2026-05-13T12:00:00+00:00',
          layoutSettings: {
            layoutAlgorithm: 'SomethingElse',
            swatches: [1, 2, 3],
          } as unknown as GenerationTemplateVersion['layoutSettings'],
          definition: {
            rootStepId: 12,
            stepsById: [],
          } as unknown as GenerationTemplateVersion['definition'],
        },
      }),
    )

    expect(recipe).toMatchObject({
      title: 'Template',
      layers: [
        {
          label: 'L1',
        },
      ],
      models: [],
      edges: [],
      filters: [],
      swatches: ['#C4006A', '#1D8B68', '#6A2B4D', '#18181B'],
      layoutAlgorithm: 'Layered',
    })
  })

  it('expands multi-hop traversal routes into hidden generation steps', () => {
    const previewSource = recipeToInlineDefinition({
      ...createRecipeFromTemplate(createTemplate()),
      models: [
        {
          id: 'provider',
          appLabel: 'infrastructure',
          appVerboseName: 'Infrastructure',
          modelName: 'CloudProvider',
          modelId: 'infrastructure.CloudProvider',
          displayName: 'Cloud provider',
          layerId: 'layer-provider',
        },
        {
          id: 'server',
          appLabel: 'infrastructure',
          appVerboseName: 'Infrastructure',
          modelName: 'Server',
          modelId: 'infrastructure.Server',
          displayName: 'Server',
          layerId: 'layer-server',
        },
      ],
      edges: [
        {
          id: 'edge-provider--server-r0',
          from: 'Cloud provider',
          to: 'Server',
          fromModelId: 'provider',
          toModelId: 'server',
          via: 'regions -> networks -> servers',
          routeSteps: [
            {
              fromModel: 'infrastructure.CloudProvider',
              toModel: 'infrastructure.Region',
              viaField: 'regions',
              isForward: false,
              isMany: true,
            },
            {
              fromModel: 'infrastructure.Region',
              toModel: 'infrastructure.Network',
              viaField: 'networks',
              isForward: false,
              isMany: true,
            },
            {
              fromModel: 'infrastructure.Network',
              toModel: 'infrastructure.Server',
              viaField: 'servers',
              isForward: false,
              isMany: true,
            },
          ],
          auto: false,
          cost: 3,
        },
      ],
    })

    expect(previewSource?.inlineDefinition).toMatchObject({
      rootStepId: 'provider',
      stepsById: {
        provider: {
          childIds: ['edge-provider--server-r0:hop-1'],
          resolvedModelId: 'infrastructure.CloudProvider',
          visibility: 'visible',
        },
        'edge-provider--server-r0:hop-1': {
          parentId: 'provider',
          childIds: ['edge-provider--server-r0:hop-2'],
          relationship: 'regions',
          resolvedModelId: 'infrastructure.Region',
          visibility: 'hidden',
        },
        'edge-provider--server-r0:hop-2': {
          parentId: 'edge-provider--server-r0:hop-1',
          childIds: ['server'],
          relationship: 'networks',
          resolvedModelId: 'infrastructure.Network',
          visibility: 'hidden',
        },
        server: {
          parentId: 'edge-provider--server-r0:hop-2',
          relationship: 'servers',
          resolvedModelId: 'infrastructure.Server',
          visibility: 'visible',
        },
      },
    })
  })
})
