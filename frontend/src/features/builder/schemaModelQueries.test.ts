import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  schemaVizTemplateUniquenessCreate,
  schemaVizTemplatesCreate,
  schemaVizTemplatesPartialUpdate,
} from '@/api/generated/schema-viz'
import { saveBuilderStyleTemplateDraft } from './schemaModelQueries'

vi.mock('@/api/generated/schema-viz', () => ({
  schemaVizModelsList: vi.fn(),
  schemaVizQueryMetadataCreate: vi.fn(),
  schemaVizRouteList: vi.fn(),
  schemaVizTemplateUniquenessCreate: vi.fn(),
  schemaVizTemplatesCreate: vi.fn(),
  schemaVizTemplatesList: vi.fn(),
  schemaVizTemplatesPartialUpdate: vi.fn(),
}))

const createTemplateMock = vi.mocked(schemaVizTemplatesCreate)
const patchTemplateMock = vi.mocked(schemaVizTemplatesPartialUpdate)
const uniquenessMock = vi.mocked(schemaVizTemplateUniquenessCreate)

const model = {
  id: 'model-service',
  appLabel: 'catalog',
  appVerboseName: 'Catalog',
  modelName: 'Service',
  modelId: 'catalog.Service',
  displayName: 'Service',
  layerId: 'layer-1',
}

const draft = {
  sourceTemplateId: null,
  persistedTemplateId: null,
  name: 'Service node',
  textContent: { root: { children: [] } },
  visualStyles: {},
  dimensions: {},
  typeSpecificData: {},
  dirty: true,
  saveState: 'idle' as const,
}

describe('builder schema model mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createTemplateMock.mockResolvedValue({
      data: {
        id: '018f3b2e-8a9a-7c6d-9e0f-123456789abc',
        name: 'Service node',
        targetModelStatus: 'ok',
        createdAt: '2026-05-17T00:00:00+00:00',
        updatedAt: '2026-05-17T00:00:00+00:00',
        revision: 1,
      },
      headers: new Headers(),
      status: 201,
    })
    patchTemplateMock.mockResolvedValue({
      data: {
        id: '018f3b2e-8a9a-7c6d-9e0f-abcdefabcdef',
        name: 'Service node',
        targetModelStatus: 'ok',
        createdAt: '2026-05-17T00:00:00+00:00',
        updatedAt: '2026-05-17T00:00:00+00:00',
        revision: 2,
      },
      headers: new Headers(),
      status: 200,
    })
    uniquenessMock.mockResolvedValue({
      data: {
        nameUnique: true,
      },
      headers: new Headers(),
      status: 200,
    })
  })

  it('creates a style template for new session drafts', async () => {
    await saveBuilderStyleTemplateDraft({
      draft,
      model,
    })

    expect(createTemplateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        isModelExclusive: true,
        name: 'Service node',
        targetModel: 'catalog.service',
        textContent: draft.textContent,
      }),
    )
    expect(patchTemplateMock).not.toHaveBeenCalled()
  })

  it('patches only drafts saved in this builder session', async () => {
    await saveBuilderStyleTemplateDraft({
      draft: {
        ...draft,
        persistedTemplateId: '018f3b2e-8a9a-7c6d-9e0f-abcdefabcdef',
      },
      model,
    })

    expect(patchTemplateMock).toHaveBeenCalledWith(
      '018f3b2e-8a9a-7c6d-9e0f-abcdefabcdef',
      expect.objectContaining({
        targetModel: 'catalog.service',
      }),
    )
    expect(createTemplateMock).not.toHaveBeenCalled()
  })
})
