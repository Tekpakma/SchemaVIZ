import * as z from 'zod'
import { toolDefinition } from '@tanstack/ai'

import { diagramSpecSchema } from './diagramSpec'

/**
 * Tools that edit the diagram open in the builder. They have no server
 * implementation: the browser executes them against the builder store, so
 * the canvas updates in place and the server never holds editor state.
 */

export const applyDiagramSpecDef = toolDefinition({
  name: 'applyDiagramSpec',
  description:
    'Put a diagram specification onto the canvas the user is looking at. Validate it with validateDiagram first. "replace" clears the current diagram; "merge" keeps existing models and adds the missing ones. Steps with groupMode "group" become containment boxes, styles set shape/colour/fields per model (unstyled models get sensible defaults), layout runs automatically.',
  inputSchema: z.object({
    spec: diagramSpecSchema,
    mode: z
      .enum(['replace', 'merge'])
      .optional()
      .describe('Defaults to "replace".'),
  }),
  outputSchema: z.object({
    modelCount: z.number(),
    edgeCount: z.number(),
    addedModels: z.array(z.string()),
  }),
})

export const removeModelsDef = toolDefinition({
  name: 'removeModels',
  description:
    'Remove models from the canvas. Relationships and filters touching them are removed as well. Use this for requests like "drop the audit tables".',
  inputSchema: z.object({
    modelIds: z.array(z.string()).min(1),
  }),
  outputSchema: z.object({
    removed: z.array(z.string()),
    notFound: z.array(z.string()),
  }),
})

export const setLayoutDirectionDef = toolDefinition({
  name: 'setLayoutDirection',
  description: 'Change the flow direction of the canvas layout.',
  inputSchema: z.object({
    direction: z.enum(['LR', 'RL', 'TB', 'BT']),
  }),
  outputSchema: z.object({ direction: z.string() }),
})

export const setRootRecordDef = toolDefinition({
  name: 'setRootRecord',
  description:
    'Switch the live preview to a specific record of the root model, so the canvas shows real data. Resolve the record id with findRecords first.',
  inputSchema: z.object({
    recordId: z.string(),
    label: z.string().describe('Display name of the record, shown in the UI.'),
  }),
  outputSchema: z.object({
    rootModel: z.string(),
    recordId: z.string(),
  }),
})

export const builderToolDefs = [
  applyDiagramSpecDef,
  removeModelsDef,
  setLayoutDirectionDef,
  setRootRecordDef,
]
