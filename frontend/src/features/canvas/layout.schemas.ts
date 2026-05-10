import { z } from 'zod'
import type {
  CanvasEdge,
  CanvasFlowDirection,
  CanvasNode,
  EdgeId,
  NodeId,
} from './model/types'

export const layoutOptionsSchema = z
  .record(z.string(), z.string())
  .optional()
  .catch(undefined)
export const canvasFlowDirectionSchema = z
  .enum(['LR', 'RL', 'TB', 'BT'])
  .catch('LR') as z.ZodType<CanvasFlowDirection>

export const canvasLayoutInputSchema = z.object({
  nodesById: z.record(z.string(), z.custom<CanvasNode>()).catch({}),
  nodeOrder: z.array(z.string()).catch([]) as unknown as z.ZodType<
    Array<NodeId>
  >,
  childIdsByGroupId: z.record(z.string(), z.custom<Array<NodeId>>()).catch({}),
  edgesById: z.record(z.string(), z.custom<CanvasEdge>()).catch({}),
  edgeOrder: z.array(z.string()).catch([]) as unknown as z.ZodType<
    Array<EdgeId>
  >,
  flowDirection: canvasFlowDirectionSchema,
  layoutOptions: layoutOptionsSchema,
})

export type CanvasLayoutInput = z.infer<typeof canvasLayoutInputSchema>

export const schemaLayoutInputSchema = z
  .object({
    flowDirection: canvasFlowDirectionSchema,
    layoutOptions: layoutOptionsSchema,
  })
  .catch({ flowDirection: 'LR', layoutOptions: undefined })
