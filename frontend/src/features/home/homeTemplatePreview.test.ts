import { describe, expect, it } from 'vitest'

import { GenerationTemplateQuickAccessEntry } from '@/api/contracts'
import type { GenerationTemplateQuickAccessEntryOutput } from '@/api/contracts'
import {
  createHomeTemplatePreview,
  filterHomeTemplatePreviews,
  uniqueHomeTemplatePreviews,
} from './homeTemplatePreview'

function createTemplate(overrides: Record<string, unknown> = {}) {
  return {
    id: '018f3b2e-8a9a-7c6d-9e0f-123456789abc',
    name: 'Cloud overview',
    description: 'Cloud provider topology',
    rootModel: 'infrastructure.CloudProvider',
    scope: 'global',
    ownedByCurrentUser: false,
    featured: {
      enabled: true,
      rank: 1,
    },
    shareSlug: 'cloud-overview',
    draftVersion: {
      id: '018f3b2e-8a9a-7c6d-9e0f-abcdefabcdef',
      versionNumber: 1,
      rootModel: 'infrastructure.CloudProvider',
      layoutSettings: {
        layoutAlgorithm: 'Layered',
        layoutDirection: 'TB',
        swatches: ['#C4006A'],
      },
      createdBy: {
        id: 7,
        displayName: 'Platform Team',
      },
      createdAt: '2026-05-13T12:00:00+00:00',
      definition: {
        rootStepId: 'provider',
        stepsById: {
          provider: {
            id: 'provider',
            parentId: null,
            childIds: ['region'],
            relationship: null,
            resolvedModelId: 'infrastructure.CloudProvider',
            visibility: 'visible',
            groupMode: 'none',
            label: 'Provider',
          },
          region: {
            id: 'region',
            parentId: 'provider',
            childIds: [],
            relationship: 'regions',
            resolvedModelId: 'infrastructure.Region',
            visibility: 'visible',
            groupMode: 'none',
            label: 'Region',
          },
        },
      },
    },
    publishedVersion: null,
    publishedAt: null,
    publishedBy: null,
    createdAt: '2026-05-13T12:00:00+00:00',
    updatedAt: '2026-05-13T12:00:00+00:00',
    ...overrides,
  }
}

function createRun() {
  return {
    mode: 'live',
    result: {
      nodes: [
        {
          id: 'provider-1',
          appLabel: 'infrastructure',
          modelName: 'CloudProvider',
          recordPk: '1',
          label: 'AWS',
          displayName: 'AWS',
          fields: { name: 'AWS' },
          styleTemplateId: null,
          parentId: null,
          stepUiIds: ['provider'],
        },
        {
          id: 'region-1',
          appLabel: 'infrastructure',
          modelName: 'Region',
          recordPk: '10',
          label: 'eu-central-1',
          displayName: 'eu-central-1',
          fields: { name: 'eu-central-1' },
          styleTemplateId: null,
          parentId: null,
          stepUiIds: ['region'],
        },
      ],
      edges: [
        {
          source: 'provider-1',
          target: 'region-1',
          relationship: 'regions',
        },
      ],
    },
    sourceVersion: {
      kind: 'template',
      selection: 'published',
      versionId: null,
      versionNumber: 1,
      rootModel: 'infrastructure.CloudProvider',
      layoutSettings: {},
      publishedAt: null,
      shareSlug: 'cloud-overview',
    },
    styleTemplates: [],
    groupTemplates: [],
  }
}

function createEntry(
  overrides: Record<string, unknown> = {},
): GenerationTemplateQuickAccessEntryOutput {
  return GenerationTemplateQuickAccessEntry.parse({
    template: createTemplate(),
    source: 'featured',
    sampleRecordId: '1',
    sampleRecordDisplayName: 'AWS',
    previewStatus: 'ready',
    run: createRun(),
    result: createRun().result,
    styleTemplates: [],
    ...overrides,
  })
}

describe('home template preview adapter', () => {
  it('uses ready run data for counts and generation navigation', () => {
    const preview = createHomeTemplatePreview(createEntry())

    expect(preview).toMatchObject({
      author: 'Platform Team',
      edgeCount: 1,
      nodeCount: 2,
      statusLabel: 'Ready',
      navigationTarget: {
        type: 'generation-run',
        shareSlug: 'cloud-overview',
        recordId: '1',
      },
    })
    expect(preview.generationResponse?.result.nodes).toHaveLength(2)
    expect(preview.recipe.layoutDirection).toBe('TB')
  })

  it('falls back to record selection when a shared template has no sample record', () => {
    const preview = createHomeTemplatePreview(
      createEntry({
        previewStatus: 'no_record',
        run: null,
        result: null,
        sampleRecordDisplayName: null,
        sampleRecordId: null,
      }),
    )

    expect(preview.generationResponse).toBeNull()
    expect(preview.nodeCount).toBe(2)
    expect(preview.edgeCount).toBe(1)
    expect(preview.navigationTarget).toEqual({
      type: 'generation-select-record',
      shareSlug: 'cloud-overview',
    })
  })

  it('routes private own templates back to the builder', () => {
    const preview = createHomeTemplatePreview(
      createEntry({
        source: 'own',
        template: createTemplate({
          featured: { enabled: false, rank: null },
          scope: 'owner',
          shareSlug: null,
        }),
      }),
    )

    expect(preview.promotion).toBe('personal')
    expect(preview.navigationTarget).toEqual({
      type: 'builder',
      templateId: '018f3b2e-8a9a-7c6d-9e0f-123456789abc',
    })
  })

  it('filters and de-duplicates home template previews', () => {
    const readyPreview = createHomeTemplatePreview(createEntry())
    const issuePreview = createHomeTemplatePreview(
      createEntry({
        previewStatus: 'error',
        run: null,
        result: null,
        template: createTemplate({
          id: '018f3b2e-8a9a-7c6d-9e0f-fedcba987654',
          name: 'Broken preview',
        }),
      }),
    )

    expect(
      uniqueHomeTemplatePreviews([readyPreview, readyPreview]),
    ).toHaveLength(1)
    expect(
      filterHomeTemplatePreviews([readyPreview, issuePreview], 'issues'),
    ).toEqual([issuePreview])
  })
})
