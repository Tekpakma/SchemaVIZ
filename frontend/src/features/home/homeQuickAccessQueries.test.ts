import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { GenerationTemplateQuickAccessEntry } from '@/api/contracts'
import {
  HOME_QUICK_ACCESS_QUERIES,
  HomeQuickAccessRequestError,
  shouldRetryHomeQuickAccessRequest,
} from './homeQuickAccessQueries'

const fetchMock = vi.fn<typeof fetch>()

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    headers: { 'content-type': 'application/json' },
    status,
  })
}

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
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches all accessible templates with samples for the all templates section', async () => {
    const entry = createQuickAccessEntry()
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        {
          ...entry.template,
          ownedByCurrentUser: false,
          featured: { enabled: false, rank: null },
          sample: {
            recordId: null,
            recordDisplayName: null,
            status: 'no_record',
          },
        },
      ]),
    )

    const query = HOME_QUICK_ACCESS_QUERIES.all()

    await expect(query.queryFn!({} as never)).resolves.toMatchObject([
      {
        previewStatus: 'no_record',
        source: 'global',
        template: { name: 'Cloud overview' },
      },
    ])
    expect(fetchMock).toHaveBeenCalledWith(
      '/schema-viz/generation-templates/?includeSample=true',
      {
        credentials: 'include',
        headers: { accept: 'application/json' },
      },
    )
  })

  it('parses own recent quick-access responses at the API boundary', async () => {
    const entry = createQuickAccessEntry()
    fetchMock.mockResolvedValueOnce(jsonResponse({ ownRecent: [entry] }))

    const query = HOME_QUICK_ACCESS_QUERIES.ownRecent()

    await expect(query.queryFn!({} as never)).resolves.toMatchObject({
      ownRecent: [
        {
          previewStatus: 'no_record',
          template: { name: 'Cloud overview' },
        },
      ],
    })
    expect(fetchMock).toHaveBeenCalledWith(
      '/schema-viz/generation-template-quick-access/',
      {
        credentials: 'include',
        headers: { accept: 'application/json' },
      },
    )
  })

  it('passes pagination params to the featured quick-access endpoint', async () => {
    const entry = createQuickAccessEntry()
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        count: 1,
        next: null,
        previous: null,
        results: [entry],
      }),
    )

    const query = HOME_QUICK_ACCESS_QUERIES.featured({ limit: 4, offset: 2 })

    await expect(query.queryFn!({} as never)).resolves.toMatchObject({
      count: 1,
      results: [{ template: { shareSlug: 'cloud-overview' } }],
    })
    expect(fetchMock).toHaveBeenCalledWith(
      '/schema-viz/generation-template-quick-access/featured/?limit=4&offset=2',
      {
        credentials: 'include',
        headers: { accept: 'application/json' },
      },
    )
  })

  it('uses backend detail text for quick-access request failures', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ detail: 'Permission denied' }, 403),
    )

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
