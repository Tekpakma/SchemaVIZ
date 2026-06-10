import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { FilterImpactNotice } from './FilterImpactNotice'
import type { GenerationRunResponse } from './generationPreviewQuery'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      key === 'filterImpact.summary'
        ? 'Active filters hide some related records.'
        : key,
  }),
}))

function makeResponse(): GenerationRunResponse {
  return {
    mode: 'live',
    result: { nodes: [], edges: [] },
    filterImpact: [
      {
        stepId: 'step-network',
        parentStepId: 'step-provider',
        relationship: 'networks',
        parentModel: 'infrastructure.CloudProvider',
        parentRecordPk: '1',
        parentDisplayName: 'AWS',
        targetModel: 'infrastructure.Network',
        targetLabel: 'Network',
        message:
          'CloudProvider type filter removed all Networks for this record.',
      },
    ],
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

describe('FilterImpactNotice', () => {
  it('renders compact copy without backend branch detail', () => {
    const markup = renderToStaticMarkup(
      <FilterImpactNotice response={makeResponse()} />,
    )

    expect(markup).toContain('Active filters hide some related records.')
    expect(markup).not.toContain('removed all Networks')
  })
})
