import { createServerFn } from '@tanstack/react-start'
import * as R from 'remeda'
import { SchemaGraph } from '@/api/contracts'
import { schemaVizGraphRetrieve } from '@/api/generated/schema-viz'
import { authFunctionMiddleware } from '@/serverAuth/authMiddleware'

import {
  canvasLayoutInputSchema,
  schemaLayoutInputSchema,
} from './layout.schemas'
import { getForwardedBackendHeaders, runElkLayout } from './layout.server'
import {
  createCanvasLayoutInputFromGraph,
  createSchemaCanvasGraph,
} from './layoutAdapters'

export const layoutCanvasGraph = createServerFn({ method: 'POST' })
  .validator(canvasLayoutInputSchema)
  .handler(async ({ data }) => runElkLayout(data))

export const layoutSchemaGraph = createServerFn({ method: 'POST' })
  .middleware([authFunctionMiddleware])
  .validator(schemaLayoutInputSchema)
  .handler(async ({ context, data }) => {
    const response = await schemaVizGraphRetrieve({
      headers: getForwardedBackendHeaders(context.auth),
    })

    if (response.status !== 200) {
      throw new Error(`Failed to fetch schema graph: ${response.status}`)
    }

    const graph = createSchemaCanvasGraph(SchemaGraph.parse(response.data))

    const layout = await runElkLayout(
      createCanvasLayoutInputFromGraph(
        graph,
        data.flowDirection,
        data.layoutOptions,
      ),
    )

    return R.merge(graph, layout)
  })
