import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  schemaVizQueryRecordCreate,
  schemaVizQueryRecordsCreate,
} from '@/api/generated/schema-viz'

import type { AiToolContext } from './context'
import { findRecords, getRecord } from './recordTools'

vi.mock('@/api/generated/schema-viz', () => ({
  schemaVizQueryRecordCreate: vi.fn(),
  schemaVizQueryRecordsCreate: vi.fn(),
}))

vi.mock('@/features/canvas/layout.server', () => ({
  getForwardedBackendHeaders: () => ({ authorization: 'Bearer test-token' }),
}))

const recordsMock = vi.mocked(schemaVizQueryRecordsCreate)
const recordMock = vi.mocked(schemaVizQueryRecordCreate)

const context: AiToolContext = {
  auth: {
    kind: 'dev',
    user: { sub: 'tester', name: 'Tester' },
    accessToken: 'test-token',
  },
}
const toolContext = { context, emitCustomEvent: () => {} }

describe('record tools', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns identifiers and labels without the field payload', async () => {
    recordsMock.mockResolvedValue({
      data: {
        count: 137,
        page: 1,
        pageSize: 20,
        totalPages: 7,
        next: 2,
        previous: null,
        results: [
          {
            displayName: 'Finance department',
            fields: { pk: '12', name: 'Finance', secret: 'do-not-leak' },
          },
        ],
      },
      headers: new Headers(),
      status: 200,
    })

    await expect(
      findRecords.execute!(
        { appLabel: 'infrastructure', modelName: 'BusinessGroup' },
        toolContext,
      ),
    ).resolves.toEqual({
      totalMatches: 137,
      returned: [{ recordId: '12', label: 'Finance department' }],
    })
  })

  it('caps the page size the model asks for', async () => {
    recordsMock.mockResolvedValue({
      data: {
        count: 0,
        page: 1,
        pageSize: 20,
        totalPages: 0,
        next: null,
        previous: null,
        results: [],
      },
      headers: new Headers(),
      status: 200,
    })

    await findRecords.execute!(
      { appLabel: 'infrastructure', modelName: 'Server', limit: 20 },
      toolContext,
    )

    expect(recordsMock).toHaveBeenCalledWith(
      expect.objectContaining({ pageSize: 20 }),
      expect.anything(),
    )
  })

  it('forwards a field selection so large blobs stay out of the context', async () => {
    recordMock.mockResolvedValue({
      data: { displayName: 'Finance', fields: { name: 'Finance' } },
      headers: new Headers(),
      status: 200,
    })

    await expect(
      getRecord.execute!(
        {
          appLabel: 'infrastructure',
          modelName: 'BusinessGroup',
          recordId: '12',
          fields: ['name'],
        },
        toolContext,
      ),
    ).resolves.toEqual({
      recordId: '12',
      label: 'Finance',
      fields: { name: 'Finance' },
    })

    expect(recordMock).toHaveBeenCalledWith(
      expect.objectContaining({ selectFields: ['name'] }),
      expect.anything(),
    )
  })
})
