import { useState } from 'react'
import { useDebouncedValue } from '@tanstack/react-pacer'
import { useInfiniteQuery } from '@tanstack/react-query'

import type { QueryRecordsRequestRequest } from '@/api/contracts'
import { fetchRecordsPage, SCHEMA_QUERIES } from './schemaQueries'

type UsePaginatedRecordsOptions = {
  enabled?: boolean
  pageSize?: number
}

export const RECORD_PICKER_PAGE_SIZE = 50

export function usePaginatedRecords(
  params: Omit<QueryRecordsRequestRequest, 'search'>,
  options: UsePaginatedRecordsOptions = {},
) {
  const pageSize = options.pageSize ?? RECORD_PICKER_PAGE_SIZE
  const enabled =
    (options.enabled ?? true) && Boolean(params.appLabel && params.modelName)
  const [search, setSearch] = useState('')
  const [debouncedSearch] = useDebouncedValue(search.trim(), { wait: 300 })
  const isSearchPending = search.trim() !== debouncedSearch
  const queryParams = {
    ...params,
    page: 1,
    pageSize,
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
  }

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isError,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    queryKey: SCHEMA_QUERIES.recordPages(queryParams).queryKey,
    queryFn: ({ pageParam }) =>
      fetchRecordsPage({
        ...queryParams,
        page: pageParam,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.next ?? undefined,
    enabled,
    staleTime: 1000 * 60 * 5,
  })

  const records = isSearchPending
    ? []
    : (data?.pages.flatMap((page) => page.results) ?? [])

  return {
    fetchNextPage,
    hasNextPage: isSearchPending ? false : hasNextPage,
    isError,
    isFetchingNextPage,
    isLoading: isLoading || isSearchPending,
    records,
    search,
    setSearch,
  }
}
