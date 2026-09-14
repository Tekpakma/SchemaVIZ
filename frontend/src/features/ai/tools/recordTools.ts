import * as z from 'zod'
import { toolDefinition } from '@tanstack/ai'

import {
  schemaVizQueryRecordCreate,
  schemaVizQueryRecordsCreate,
} from '@/api/generated/schema-viz'

import type { AiToolContext } from './context'
import { backendRequestInit, unwrapOk } from './context'

/** The model picks the page size, so it needs a ceiling it cannot argue with. */
const MAX_RECORDS_PER_CALL = 20

function readRecordPk(fields: Record<string, unknown>): string {
  return String(fields.pk ?? fields.id ?? '')
}

export const findRecordsDef = toolDefinition({
  name: 'findRecords',
  description:
    'Search records of a model to obtain a record id. Use this to turn a name the user mentioned into the recordId that createDiagram needs. Returns identifiers and labels only, never full field data.',
  inputSchema: z.object({
    appLabel: z.string(),
    modelName: z.string(),
    search: z
      .string()
      .optional()
      .describe('Free-text search across the model’s searchable fields.'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_RECORDS_PER_CALL)
      .optional()
      .describe(`How many records to return, at most ${MAX_RECORDS_PER_CALL}.`),
  }),
  outputSchema: z.object({
    totalMatches: z.number(),
    returned: z.array(z.object({ recordId: z.string(), label: z.string() })),
  }),
})

export const findRecords = findRecordsDef.server<AiToolContext>(
  async ({ appLabel, modelName, search, limit }, { context }) => {
    const response = await schemaVizQueryRecordsCreate(
      {
        appLabel,
        modelName,
        page: 1,
        pageSize: Math.min(limit ?? MAX_RECORDS_PER_CALL, MAX_RECORDS_PER_CALL),
        ...(search ? { search } : {}),
      },
      backendRequestInit(context),
    )
    const page = unwrapOk(response, 'find records')

    return {
      totalMatches: page.count,
      returned: page.results.map((record) => ({
        recordId: readRecordPk(record.fields),
        label: record.displayName,
      })),
    }
  },
)

export const getRecordDef = toolDefinition({
  name: 'getRecord',
  description:
    'Read the field values of a single record. Name the fields you need — asking for everything wastes context and may return large blobs.',
  inputSchema: z.object({
    appLabel: z.string(),
    modelName: z.string(),
    recordId: z.string(),
    fields: z
      .array(z.string())
      .optional()
      .describe('Field names to return. Omit only when you truly need all.'),
  }),
  outputSchema: z.object({
    recordId: z.string(),
    label: z.string(),
    fields: z.record(z.string(), z.unknown()),
  }),
})

export const getRecord = getRecordDef.server<AiToolContext>(
  async ({ appLabel, modelName, recordId, fields }, { context }) => {
    const response = await schemaVizQueryRecordCreate(
      {
        appLabel,
        modelName,
        id: recordId,
        ...(fields?.length ? { selectFields: fields } : {}),
      },
      backendRequestInit(context),
    )
    const record = unwrapOk(response, 'get record')

    return {
      recordId,
      label: record.displayName,
      fields: record.fields,
    }
  },
)
