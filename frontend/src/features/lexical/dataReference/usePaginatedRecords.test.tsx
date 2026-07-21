/** @vitest-environment jsdom */

import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { schemaVizQueryRecordsCreate } from '@/api/generated/schema-viz'
import {
  RECORD_PICKER_PAGE_SIZE,
  usePaginatedRecords,
} from './usePaginatedRecords'

vi.mock('@/api/generated/schema-viz', () => ({
  schemaVizModelDetailsRetrieve: vi.fn(),
  schemaVizQueryRecordCreate: vi.fn(),
  schemaVizQueryRecordsCreate: vi.fn(),
}))

const queryRecordsMock = vi.mocked(schemaVizQueryRecordsCreate)

function recordsResponse(page: number, next: number | null, id: string) {
  return {
    status: 200,
    data: {
      count: 3,
      page,
      pageSize: RECORD_PICKER_PAGE_SIZE,
      totalPages: 3,
      next,
      previous: page > 1 ? page - 1 : null,
      results: [
        {
          displayName: `Record ${id}`,
          fields: { id },
        },
      ],
    },
    headers: new Headers(),
  } as never
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('usePaginatedRecords', () => {
  it('loads additional server pages only when requested', async () => {
    queryRecordsMock
      .mockResolvedValueOnce(recordsResponse(1, 2, 'first'))
      .mockResolvedValueOnce(recordsResponse(2, null, 'last'))

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    const { result } = renderHook(
      () =>
        usePaginatedRecords({
          appLabel: 'auth',
          modelName: 'user',
          page: 1,
        }),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.records.map((record) => record.fields.id)).toEqual([
        'first',
      ])
    })

    expect(result.current.hasNextPage).toBe(true)
    expect(result.current.isLoading).toBe(false)
    expect(queryRecordsMock).toHaveBeenCalledTimes(1)

    await act(() => result.current.fetchNextPage())

    await waitFor(() => {
      expect(result.current.records.map((record) => record.fields.id)).toEqual([
        'first',
        'last',
      ])
    })

    expect(result.current.hasNextPage).toBe(false)
    expect(queryRecordsMock).toHaveBeenNthCalledWith(1, {
      appLabel: 'auth',
      modelName: 'user',
      page: 1,
      pageSize: RECORD_PICKER_PAGE_SIZE,
    })
    expect(queryRecordsMock).toHaveBeenNthCalledWith(2, {
      appLabel: 'auth',
      modelName: 'user',
      page: 2,
      pageSize: RECORD_PICKER_PAGE_SIZE,
    })
  })

  it('debounces search and sends it to QLab on a fresh first page', async () => {
    queryRecordsMock.mockResolvedValueOnce(recordsResponse(1, null, 'match'))

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    const { result, rerender } = renderHook(
      ({ enabled }) =>
        usePaginatedRecords(
          {
            appLabel: 'auth',
            modelName: 'user',
            page: 3,
          },
          { enabled },
        ),
      { initialProps: { enabled: false }, wrapper },
    )

    act(() => result.current.setSearch('  charlie  '))
    expect(queryRecordsMock).not.toHaveBeenCalled()

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    rerender({ enabled: true })

    await waitFor(() => expect(queryRecordsMock).toHaveBeenCalledTimes(1))
    expect(queryRecordsMock).toHaveBeenCalledWith({
      appLabel: 'auth',
      modelName: 'user',
      page: 1,
      pageSize: RECORD_PICKER_PAGE_SIZE,
      search: 'charlie',
    })
  })

  it('does not query QLab while its picker is disabled', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    const { result } = renderHook(
      () =>
        usePaginatedRecords(
          {
            appLabel: 'auth',
            modelName: 'user',
            page: 1,
          },
          { enabled: false },
        ),
      { wrapper },
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(queryRecordsMock).not.toHaveBeenCalled()
  })
})
