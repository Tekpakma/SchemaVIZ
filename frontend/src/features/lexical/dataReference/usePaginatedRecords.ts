import { useInfiniteQuery } from '@tanstack/react-query'

import type { QueryRecordsRequestRequest } from '@/api/contracts'
import {
  fetchRecordsPage,
  QUERY_RECORDS_PAGE_SIZE,
  SCHEMA_QUERIES,
} from './schemaQueries'

type UsePaginatedRecordsOptions = {
  enabled?: boolean
  pageSize?: number
}

export function usePaginatedRecords(
  params: QueryRecordsRequestRequest,
  options: UsePaginatedRecordsOptions = {},
) {
  const pageSize = options.pageSize ?? QUERY_RECORDS_PAGE_SIZE
  const enabled =
    (options.enabled ?? true) && Boolean(params.appLabel && params.modelName)

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isError,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    queryKey: SCHEMA_QUERIES.recordPages({ ...params, pageSize }).queryKey,
    queryFn: ({ pageParam }) =>
      fetchRecordsPage({
        ...params,
        page: pageParam,
        pageSize,
      }),
    initialPageParam: params.page ?? 1,
    getNextPageParam: (lastPage) => lastPage.next ?? undefined,
    enabled,
    staleTime: 1000 * 60 * 5,
  })

  const records = data?.pages.flatMap((page) => page.results) ?? []

  return {
    fetchNextPage,
    hasNextPage,
    isError,
    isFetchingNextPage,
    isLoading,
    records,
  }
}
