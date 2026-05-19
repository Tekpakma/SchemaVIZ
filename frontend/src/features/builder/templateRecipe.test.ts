import { describe, expect, it } from 'vitest'

import type { GenerationTemplateRead } from '@/api/contracts'
import {
  createRecipeFromTemplate,
  recipeToGenerationTemplateWriteRequest,
  recipeToInlineDefinition,
} from './templateRecipe'

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
                styleTemplateId: 'style-provider',
              },
              region: {
                parentId: 'provider',
                relationship: 'regions',
                resolvedModelId: 'cloud.Region',
                childIds: [],
                styleTemplateId: 'style-region',
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
          styleTemplateId: 'style-provider',
        },
        {
          id: 'region',
          modelId: 'cloud.Region',
          displayName: 'Region',
          layerId: 'layer-region',
          styleTemplateId: 'style-region',
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
          modelId: 'region',
          filterFields: {
            active: true,
          },
        },
      ],
      swatches: ['#111111', '#222222'],
      layoutAlgorithm: 'Force',
      shareSlug: '',
      promoteVisibility: 'org-wide',
      promoteAudience: 'All users',
    })
  })

  it('converts builder recipes to backend write payloads', () => {
    const recipe = {
      ...createRecipeFromTemplate(
        createTemplate({
          name: 'Cloud overview',
          description: 'Existing description',
          scope: 'owner',
          shareSlug: 'old-cloud-overview',
        }),
      ),
      title: 'Cloud overview draft',
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
      ],
      shareSlug: 'cloud-overview',
    }

    expect(
      recipeToGenerationTemplateWriteRequest(recipe, {
        template: createTemplate({
          description: 'Existing description',
          scope: 'owner',
        }),
      }),
    ).toMatchObject({
      name: 'Cloud overview draft',
      description: 'Existing description',
      rootModel: 'infrastructure.CloudProvider',
      scope: 'owner',
      shareSlug: 'cloud-overview',
      definition: {
        rootStepId: 'provider',
      },
      layoutSettings: {
        layoutAlgorithm: 'Layered',
      },
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

  it('emits QLab filterFields in inline generation definitions', () => {
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
          id: 'network',
          appLabel: 'infrastructure',
          appVerboseName: 'Infrastructure',
          modelName: 'Network',
          modelId: 'infrastructure.Network',
          displayName: 'Network',
          layerId: 'layer-network',
          styleTemplateId: 'style-network',
        },
      ],
      edges: [
        {
          id: 'edge-provider-network',
          from: 'Cloud provider',
          to: 'Network',
          fromModelId: 'provider',
          toModelId: 'network',
          via: 'networks',
          auto: true,
          cost: 1,
        },
      ],
      filters: [
        {
          id: 'filter-network-active',
          layer: 'Network',
          expr: 'is_active is true',
          suggested: false,
          modelId: 'network',
          filterFields: {
            andOperation: [
              {
                field: 'is_active',
                op: 'is',
                value: true,
              },
            ],
          },
        },
      ],
    })

    expect(previewSource?.inlineDefinition.stepsById.network?.filter).toEqual({
      andOperation: [
        {
          field: 'is_active',
          op: 'is',
          value: true,
        },
      ],
    })
    expect(
      previewSource?.inlineDefinition.stepsById.network?.styleTemplateId,
    ).toBe('style-network')
  })

  it('exports group rules by marking the parent step as the compound group', () => {
    const previewSource = recipeToInlineDefinition({
      ...createRecipeFromTemplate(createTemplate()),
      models: [
        {
          id: 'business-group',
          appLabel: 'infrastructure',
          appVerboseName: 'Infrastructure',
          modelName: 'BusinessGroup',
          modelId: 'infrastructure.BusinessGroup',
          displayName: 'Business group',
          layerId: 'layer-business-group',
        },
        {
          id: 'cloud-provider',
          appLabel: 'infrastructure',
          appVerboseName: 'Infrastructure',
          modelName: 'CloudProvider',
          modelId: 'infrastructure.CloudProvider',
          displayName: 'Cloud provider',
          layerId: 'layer-cloud-provider',
        },
      ],
      edges: [
        {
          id: 'edge-business-provider',
          from: 'Business group',
          to: 'Cloud provider',
          fromModelId: 'business-group',
          toModelId: 'cloud-provider',
          via: 'provider',
          auto: true,
          cost: 1,
        },
      ],
      groupRules: [
        {
          id: 'group-provider',
          parentModelId: 'business-group',
          childModelId: 'cloud-provider',
          via: 'provider',
          mode: 'group',
        },
      ],
    })

    expect(
      previewSource?.inlineDefinition.stepsById['business-group']?.groupMode,
    ).toBe('group')
    expect(
      previewSource?.inlineDefinition.stepsById['cloud-provider']?.groupMode,
    ).toBe('none')
  })

  it('imports parent group definitions as builder group rules', () => {
    const recipe = createRecipeFromTemplate(
      createTemplate({
        draftVersion: {
          id: '018f3b2e-8a9a-7c6d-9e0f-grouped000001',
          versionNumber: 1,
          rootModel: 'infrastructure.BusinessGroup',
          createdBy: null,
          createdAt: '2026-05-13T12:00:00+00:00',
          layoutSettings: {},
          definition: {
            rootStepId: 'business-group',
            stepsById: {
              'business-group': {
                id: 'business-group',
                parentId: null,
                childIds: ['cloud-provider'],
                relationship: null,
                resolvedModelId: 'infrastructure.BusinessGroup',
                visibility: 'visible',
                groupMode: 'group',
                styleTemplateId: null,
                label: 'Business group',
                filter: null,
              },
              'cloud-provider': {
                id: 'cloud-provider',
                parentId: 'business-group',
                childIds: [],
                relationship: 'provider',
                resolvedModelId: 'infrastructure.CloudProvider',
                visibility: 'visible',
                groupMode: 'none',
                styleTemplateId: null,
                label: 'Cloud provider',
                filter: null,
              },
            },
          },
        },
      }),
    )

    expect(recipe.groupRules).toMatchObject([
      {
        parentModelId: 'business-group',
        childModelId: 'cloud-provider',
        mode: 'group',
        layout: { mode: 'auto-pack' },
      },
    ])
  })
})
