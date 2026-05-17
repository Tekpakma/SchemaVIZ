import { afterEach, describe, expect, it, vi } from 'vitest'

import { schemaVizFetch } from './fetch'

vi.mock('./sourceAuth', () => ({
  redirectToLogin: vi.fn(),
}))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('schemaVizFetch', () => {
  it('returns the orval response envelope for successful responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 201,
        headers: {
          'content-type': 'application/json',
          'x-test': 'ok',
        },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const response = await schemaVizFetch<{
      data: { ok: boolean }
      status: number
      headers: Headers
    }>('/schema-viz/drawings/', {
      method: 'POST',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      '/schema-viz/drawings/',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: expect.any(Headers),
      }),
    )
    expect(response.data).toEqual({ ok: true })
    expect(response.status).toBe(201)
    expect(response.headers.get('x-test')).toBe('ok')
  })

  it('returns non-ok responses instead of throwing so generated unions stay usable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'boom' }), {
          status: 500,
          headers: {
            'content-type': 'application/json',
          },
        }),
      ),
    )

    const response = await schemaVizFetch<{
      data: { error: string }
      status: number
      headers: Headers
    }>('/schema-viz/graph/')

    expect(response.status).toBe(500)
    expect(response.data).toEqual({ error: 'boom' })
  })

  it('adds the Django CSRF header for unsafe browser requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('document', {
      cookie: 'csrftoken=test-token; sessionid=session-token',
    })

    await schemaVizFetch('/schema-viz/query/records/', {
      method: 'POST',
    })

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit
    const headers = requestInit.headers as Headers
    expect(headers.get('X-CSRFToken')).toBe('test-token')
  })

  it('does not replace an explicit CSRF header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('document', {
      cookie: 'csrftoken=cookie-token',
    })

    await schemaVizFetch('/schema-viz/query/records/', {
      method: 'POST',
      headers: {
        'X-CSRFToken': 'explicit-token',
      },
    })

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit
    const headers = requestInit.headers as Headers
    expect(headers.get('X-CSRFToken')).toBe('explicit-token')
  })
})
