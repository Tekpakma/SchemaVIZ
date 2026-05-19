import { describe, expect, it, vi } from 'vitest'

import { GenerationTemplateQuickAccessEntry } from '@/api/contracts'
import {
  schemaVizGenerationTemplateQuickAccessFeaturedList,
  schemaVizGenerationTemplateQuickAccessRetrieve,
} from '@/api/generated/schema-viz'
import {
  HOME_QUICK_ACCESS_QUERIES,
  HomeQuickAccessRequestError,
  shouldRetryHomeQuickAccessRequest,
} from './homeQuickAccessQueries'

vi.mock('@/api/generated/schema-viz', () => ({
  schemaVizGenerationTemplateQuickAccessFeaturedList: vi.fn(),
  schemaVizGenerationTemplateQuickAccessRetrieve: vi.fn(),
}))

const featuredListMock = vi.mocked(
  schemaVizGenerationTemplateQuickAccessFeaturedList,
)
const ownRecentMock = vi.mocked(schemaVizGenerationTemplateQuickAccessRetrieve)

function createQuickAccessEntry() {
  return GenerationTemplateQuickAccessEntry.parse({
    template: {
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
      draftVersion: null,
      publishedVersion: null,
      publishedAt: null,
      publishedBy: null,
      createdAt: '2026-05-13T12:00:00+00:00',
      updatedAt: '2026-05-13T12:00:00+00:00',
    },
    source: 'featured',
    sampleRecordId: null,
    sampleRecordDisplayName: null,
    previewStatus: 'no_record',
    run: null,
    result: null,
    styleTemplates: [],
  })
}

describe('home quick-access queries', () => {
  it('parses own recent quick-access responses at the API boundary', async () => {
    const entry = createQuickAccessEntry()
    ownRecentMock.mockResolvedValueOnce({
      data: { ownRecent: [entry] },
      headers: new Headers(),
      status: 200,
    })

    const query = HOME_QUICK_ACCESS_QUERIES.ownRecent()

    await expect(query.queryFn!({} as never)).resolves.toMatchObject({
      ownRecent: [
        {
          previewStatus: 'no_record',
          template: { name: 'Cloud overview' },
        },
      ],
    })
  })

  it('passes pagination params to the featured quick-access endpoint', async () => {
    const entry = createQuickAccessEntry()
    featuredListMock.mockResolvedValueOnce({
      data: {
        count: 1,
        next: null,
        previous: null,
        results: [entry],
      },
      headers: new Headers(),
      status: 200,
    })

    const query = HOME_QUICK_ACCESS_QUERIES.featured({ limit: 4, offset: 2 })

    await expect(query.queryFn!({} as never)).resolves.toMatchObject({
      count: 1,
      results: [{ template: { shareSlug: 'cloud-overview' } }],
    })
    expect(featuredListMock).toHaveBeenCalledWith({ limit: 4, offset: 2 })
  })

  it('uses backend detail text for quick-access request failures', async () => {
    ownRecentMock.mockResolvedValueOnce({
      data: { detail: 'Permission denied' },
      headers: new Headers(),
      status: 403,
    } as never)

    const query = HOME_QUICK_ACCESS_QUERIES.ownRecent()

    await expect(query.queryFn!({} as never)).rejects.toThrow(
      'Permission denied',
    )
  })

  it('does not retry authorization failures', () => {
    expect(
      shouldRetryHomeQuickAccessRequest(
        0,
        new HomeQuickAccessRequestError(
          'Authentication credentials missing',
          401,
        ),
      ),
    ).toBe(false)
    expect(
      shouldRetryHomeQuickAccessRequest(
        0,
        new HomeQuickAccessRequestError('Permission denied', 403),
      ),
    ).toBe(false)
    expect(
      shouldRetryHomeQuickAccessRequest(
        2,
        new HomeQuickAccessRequestError('Temporary backend issue', 503),
      ),
    ).toBe(true)
  })
})
