import { describe, expect, it, vi } from 'vitest'

import { schemaVizVersionRetrieve } from '@/api/generated/schema-viz'
import {
  BackendVersionRequestError,
  SYSTEM_VERSION_QUERIES,
  fetchBackendVersion,
} from './systemVersionQueries'

vi.mock('@/api/generated/schema-viz', () => ({
  schemaVizVersionRetrieve: vi.fn(),
}))

const versionRetrieveMock =
  schemaVizVersionRetrieve as unknown as ReturnType<typeof vi.fn>

describe('system version queries', () => {
  it('returns the backend version from the generated API client', async () => {
    versionRetrieveMock.mockResolvedValueOnce({
      data: { version: '0.7.2' },
      headers: new Headers(),
      status: 200,
    })

    await expect(fetchBackendVersion()).resolves.toBe('0.7.2')
  })

  it('uses backend detail text for version request failures', async () => {
    versionRetrieveMock.mockResolvedValueOnce({
      data: { detail: 'Version endpoint unavailable' },
      headers: new Headers(),
      status: 503,
    })

    await expect(fetchBackendVersion()).rejects.toThrow(
      new BackendVersionRequestError('Version endpoint unavailable', 503),
    )
  })

  it('exposes a stable backend version query key', () => {
    expect(SYSTEM_VERSION_QUERIES.backend().queryKey).toEqual([
      'system',
      'version',
      'backend',
    ])
  })
})
