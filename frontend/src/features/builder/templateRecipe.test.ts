import { describe, expect, it } from 'vitest'

import type { GenerationTemplateRead } from '@/api/contracts'
import { createRecipeFromTemplate } from './templateRecipe'

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
          id: 'provider',
          label: 'Provider',
        },
        {
          id: 'region',
          label: 'Region',
        },
      ],
      edges: [
        {
          id: 'edge-region',
          from: 'Provider',
          to: 'Region',
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
      layers: [],
      edges: [],
      filters: [],
      swatches: ['#C4006A', '#1D8B68', '#6A2B4D', '#18181B'],
      layoutAlgorithm: 'Layered',
    })
  })
})
