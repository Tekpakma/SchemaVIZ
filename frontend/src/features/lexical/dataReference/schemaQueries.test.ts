import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'

import { schemaVizQueryRecordsCreate } from '@/api/generated/schema-viz'
import {
  fetchAllRecordPages,
  QUERY_RECORDS_PAGE_SIZE,
  SCHEMA_QUERIES,
} from './schemaQueries'

vi.mock('@/api/generated/schema-viz', () => ({
  schemaVizModelDetailsRetrieve: vi.fn(),
  schemaVizQueryRecordCreate: vi.fn(),
  schemaVizQueryRecordsCreate: vi.fn(),
}))

const queryRecordsMock = vi.mocked(schemaVizQueryRecordsCreate)

function recordsResponse(page: number, next: number | null, ids: string[]) {
  return {
    status: 200,
    data: {
      count: ids.length,
      page,
      pageSize: QUERY_RECORDS_PAGE_SIZE,
      totalPages: next == null ? page : next,
      next,
      previous: page > 1 ? page - 1 : null,
      results: ids.map((id) => ({
        displayName: `Record ${id}`,
        fields: { id },
      })),
    },
    headers: new Headers(),
  } as never
}

describe('SCHEMA_QUERIES.records', () => {
  it('keys cached record pages by pagination and selected fields', () => {
    const firstPage = SCHEMA_QUERIES.records({
      appLabel: 'auth',
      modelName: 'user',
      page: 1,
      pageSize: 50,
      selectFields: ['username'],
      filterFields: { username: 'alice' },
    }).queryKey
    const secondPage = SCHEMA_QUERIES.records({
      appLabel: 'auth',
      modelName: 'user',
      page: 2,
      pageSize: 50,
      selectFields: ['username'],
      filterFields: { username: 'alice' },
    }).queryKey
    const differentFields = SCHEMA_QUERIES.records({
      appLabel: 'auth',
      modelName: 'user',
      page: 1,
      pageSize: 50,
      selectFields: ['email'],
      filterFields: { username: 'alice' },
    }).queryKey

    expect(secondPage).not.toEqual(firstPage)
    expect(differentFields).not.toEqual(firstPage)
  })

  it('keys infinite record streams by initial page', () => {
    const firstStream = SCHEMA_QUERIES.recordPages({
      appLabel: 'auth',
      modelName: 'user',
      page: 1,
      pageSize: QUERY_RECORDS_PAGE_SIZE,
      filterFields: { username: 'alice' },
    }).queryKey
    const secondStream = SCHEMA_QUERIES.recordPages({
      appLabel: 'auth',
      modelName: 'user',
      page: 2,
      pageSize: QUERY_RECORDS_PAGE_SIZE,
      filterFields: { username: 'alice' },
    }).queryKey

    expect(secondStream).not.toEqual(firstStream)
  })

  it('keys record streams by server-side search', () => {
    const allRecords = SCHEMA_QUERIES.recordPages({
      appLabel: 'auth',
      modelName: 'user',
      page: 1,
    }).queryKey
    const matchingRecords = SCHEMA_QUERIES.recordPages({
      appLabel: 'auth',
      modelName: 'user',
      page: 1,
      search: 'alice',
    }).queryKey

    expect(matchingRecords).not.toEqual(allRecords)
  })

  it('fetches every QLab page when a caller needs complete relation records', async () => {
    queryRecordsMock
      .mockResolvedValueOnce(recordsResponse(1, 2, ['1']))
      .mockResolvedValueOnce(recordsResponse(2, null, ['2']))

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    const records = await fetchAllRecordPages(client, {
      appLabel: 'auth',
      modelName: 'user',
      filterFields: { groups: 'admin' },
    })

    expect(records.map((record) => record.fields.id)).toEqual(['1', '2'])
    expect(queryRecordsMock).toHaveBeenNthCalledWith(1, {
      appLabel: 'auth',
      modelName: 'user',
      filterFields: { groups: 'admin' },
      page: 1,
      pageSize: QUERY_RECORDS_PAGE_SIZE,
    })
    expect(queryRecordsMock).toHaveBeenNthCalledWith(2, {
      appLabel: 'auth',
      modelName: 'user',
      filterFields: { groups: 'admin' },
      page: 2,
      pageSize: QUERY_RECORDS_PAGE_SIZE,
    })
  })
})
