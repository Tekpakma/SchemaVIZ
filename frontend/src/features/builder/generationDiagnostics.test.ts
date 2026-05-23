import { describe, expect, it } from 'vitest'

import type { GenerationRunResponse } from './generationPreviewQuery'
import {
  getFilterImpactItems,
  hasFilterImpact,
} from './generationDiagnostics'

function makeResponse(
  filterImpact: NonNullable<GenerationRunResponse['filterImpact']>,
): GenerationRunResponse {
  return {
    mode: 'live',
    result: { nodes: [], edges: [] },
    filterImpact,
    sourceVersion: {
      kind: 'inline',
      selection: 'inline',
      versionId: null,
      versionNumber: null,
      rootModel: 'infrastructure.CloudProvider',
      layoutSettings: {},
      publishedAt: null,
      shareSlug: null,
    },
    styleTemplates: [],
    groupTemplates: [],
  }
}

describe('generation diagnostics', () => {
  it('treats missing filter impact as an unchanged generation', () => {
    const response = makeResponse([])

    expect(hasFilterImpact(response)).toBe(false)
    expect(getFilterImpactItems(response)).toEqual([])
  })

  it('returns backend filter impact items for compact UI summaries', () => {
    const response = makeResponse([
      {
        stepId: 'step-network',
        parentStepId: 'step-provider',
        relationship: 'networks',
        parentModel: 'infrastructure.CloudProvider',
        parentRecordPk: '1',
        parentDisplayName: 'AWS',
        targetModel: 'infrastructure.Network',
        targetLabel: 'Network',
        message: 'Filter on Network removed all infrastructure.Network records.',
      },
    ])

    expect(hasFilterImpact(response)).toBe(true)
    expect(getFilterImpactItems(response)).toHaveLength(1)
    expect(getFilterImpactItems(response)[0]?.targetLabel).toBe('Network')
  })
})
