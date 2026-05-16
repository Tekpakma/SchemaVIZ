import { queryOptions } from '@tanstack/react-query'
import * as R from 'remeda'

import {
  schemaVizModelsList,
  schemaVizRouteList,
} from '@/api/generated/schema-viz'

export const BUILDER_SCHEMA_QUERIES = {
  _base: {
    queryKey: ['builder'] as const,
  },
  models: () =>
    queryOptions({
      queryKey: [...BUILDER_SCHEMA_QUERIES._base.queryKey, 'models'],
      queryFn: async () => {
        const response = await schemaVizModelsList({ excludeDjango: true })

        if (response.status !== 200) {
          throw new Error(`Failed to fetch schema models: ${response.status}`)
        }

        return R.sortBy(
          response.data,
          R.prop('appVerboseName'),
          R.prop('verboseName'),
        )
      },
      staleTime: 1000 * 60 * 10,
    }),

  routes: (startModel: string, endModel: string, waypoints?: string[]) =>
    queryOptions({
      queryKey: [
        ...BUILDER_SCHEMA_QUERIES._base.queryKey,
        'routes',
        startModel,
        endModel,
        ...(waypoints?.length ? [waypoints.join(',')] : []),
      ] as const,
      queryFn: async () => {
        const response = await schemaVizRouteList({
          startModel,
          endModel,
          limit: 20,
          maxDepth: 12,
          ...(waypoints?.length ? { waypoints: waypoints.join(',') } : {}),
        })

        if (response.status !== 200) {
          return []
        }

        return response.data
      },
      enabled: Boolean(startModel && endModel && startModel !== endModel),
      staleTime: 1000 * 60 * 10,
    }),
}
