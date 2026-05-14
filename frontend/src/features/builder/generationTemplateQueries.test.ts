import { describe, expect, it, vi } from 'vitest'

import {
  GENERATION_TEMPLATE_QUERIES,
  GenerationTemplateNotFoundError,
} from './generationTemplateQueries'
import { schemaVizGenerationTemplatesRetrieve } from '@/api/generated/schema-viz'

vi.mock('@/api/generated/schema-viz', () => ({
  schemaVizGenerationTemplatesRetrieve: vi.fn(),
}))

const retrieveTemplateMock = vi.mocked(schemaVizGenerationTemplatesRetrieve)

describe('generation template queries', () => {
  it('maps runtime 404 responses to a template not found error', async () => {
    const templateId = '018f3b2e-8a9a-7c6d-9e0f-123456789abc'
    retrieveTemplateMock.mockResolvedValueOnce({
      data: { detail: 'Not found.' },
      status: 404,
      headers: new Headers(),
    } as never)

    const query = GENERATION_TEMPLATE_QUERIES.detail(templateId)
    expect(query.queryFn).toBeDefined()

    await expect(query.queryFn!({} as never)).rejects.toEqual(
      new GenerationTemplateNotFoundError(templateId),
    )
  })
})
