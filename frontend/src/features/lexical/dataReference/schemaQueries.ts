import type { QueryClient } from '@tanstack/react-query'
import { queryOptions } from '@tanstack/react-query'
import * as R from 'remeda'
import {
  schemaVizModelDetailsRetrieve,
  schemaVizQueryRecordCreate,
  schemaVizQueryRecordsCreate,
} from '@/api/generated/schema-viz'
import type {
  ModelInfo,
  QueryRecordRequestRequest,
  QueryRecordsRequestRequest,
} from '@/api/contracts'
import { splitModelId, toModelId } from './modelUtils'
import type { SchemaModelRef } from './modelUtils'
import {
  findFieldDefinition,
  findRelationDefinition,
  hasDirectFieldKey,
  hasDisplayValue,
  indexModelInfo,
  isKnownSegment,
  readDirectFieldValue,
  toRecordIds,
} from './fieldValues'
import type { IndexedModelInfo, RecordFields } from './fieldValues'
import type { DataReferenceResolution } from './resolveDirectReference'
import { hasKey } from '@/utils/helper'
import type { SetOptional } from 'type-fest'

export type { ModelInfo }
export type { SchemaModelRef } from './modelUtils'

export type RelationPathTarget = {
  model: IndexedModelInfo
  visitedModelIds: string[]
}

const SCHEMA_KEY = ['schema'] as const

export const SCHEMA_QUERIES = {
  _base: queryOptions({
    queryKey: SCHEMA_KEY,
  }),

  modelDetails: (ref: SchemaModelRef) =>
    queryOptions({
      queryKey: [
        ...SCHEMA_QUERIES._base.queryKey,
        'model-details',
        ref.appLabel,
        ref.modelName,
      ],
      queryFn: async () => {
        const response = await schemaVizModelDetailsRetrieve({
          appLabel: ref.appLabel,
          modelName: ref.modelName,
        })
        if (response.status !== 200) {
          throw new Error(`Failed to fetch model details: ${response.status}`)
        }
        return indexModelInfo(response.data)
      },
      staleTime: 1000 * 60 * 10,
      enabled: Boolean(ref.appLabel && ref.modelName),
    }),

  record: (params: SetOptional<QueryRecordRequestRequest, 'id'>) =>
    queryOptions({
      queryKey: [
        ...SCHEMA_QUERIES._base.queryKey,
        'record',
        params.appLabel,
        params.modelName,
        params.id ?? '',
      ],
      queryFn: async () => {
        if (!hasKey(params, 'id')) return { fields: {}, displayName: '' } // Don't attempt to fetch if no ID
        const response = await schemaVizQueryRecordCreate(
          params as QueryRecordRequestRequest,
        )
        if (response.status !== 200) {
          throw new Error(`Failed to fetch record: ${response.status}`)
        }
        return response.data
      },
      staleTime: 1000 * 60 * 5,
    }),

  records: (params: QueryRecordsRequestRequest) =>
    queryOptions({
      queryKey: [
        ...SCHEMA_QUERIES._base.queryKey,
        'records',
        params.appLabel,
        params.modelName,
        JSON.stringify(params.filterFields),
      ],
      queryFn: async () => {
        const response = await schemaVizQueryRecordsCreate(params)
        if (response.status !== 200) {
          throw new Error(`Failed to fetch records: ${response.status}`)
        }
        return response.data
      },
      staleTime: 1000 * 60 * 5,
    }),

  /**
   * Walks a chain of relations (e.g. `["author", "company"]`) starting from
   * `rootRef`, fetching each intermediate model's schema along the way.
   *
   * Returns the final model's schema (indexed) + visited model IDs (for cycle
   * detection in downstream suggestion/resolution logic).
   */
  relationPathTarget: (
    rootRef: SchemaModelRef,
    relationPath: string[],
    deps: {
      rootModelDetails: ModelInfo | undefined
    },
  ) =>
    queryOptions({
      queryKey: [
        ...SCHEMA_QUERIES._base.queryKey,
        'relation-path-target',
        rootRef.appLabel,
        rootRef.modelName,
        relationPath.join('.'),
      ],
      enabled: relationPath.length > 0 && deps.rootModelDetails != null,
      queryFn: async (context): Promise<RelationPathTarget | null> => {
        if (!deps.rootModelDetails) throw new Error('enabled check failed')

        let currentModel: ModelInfo = deps.rootModelDetails
        const visitedModelIds = new Set<string>([
          toModelId(currentModel.appLabel, currentModel.modelName),
        ])

        for (const relationName of relationPath) {
          const relation = findRelationDefinition(currentModel, relationName)
          if (!relation) return null

          const related = splitModelId(relation.relatedModel)
          if (!related) return null

          const nextId = toModelId(related.appLabel, related.modelName)
          if (visitedModelIds.has(nextId)) return null
          visitedModelIds.add(nextId)

          currentModel = await context.client.fetchQuery(
            SCHEMA_QUERIES.modelDetails(related),
          )
        }

        // Safe: after the loop, currentModel is always the result of
        // client.fetchQuery(modelDetails(...)) which returns IndexedModelInfo.
        return {
          model: currentModel as IndexedModelInfo,
          visitedModelIds: [...visitedModelIds],
        }
      },
    }),

  /**
   * Resolves deep dotted paths (e.g. "company.owner.firstName") by dynamically
   * traversing the schema graph. Fetches intermediate related records
   * step-by-step via `context.client.fetchQuery`.
   *
   * If a relation expands to multiple records (e.g. a reverse FK), the final
   * field is resolved across *all* matching records.
   */
  referenceResolution: (
    rootRef: SchemaModelRef,
    path: string,
    rootModelId: string,
    deps: {
      rootModelDetails: ModelInfo | undefined
      rootRecordFields: RecordFields
    },
  ) =>
    queryOptions({
      queryKey: [
        ...SCHEMA_QUERIES._base.queryKey,
        'reference-resolution',
        rootRef.appLabel,
        rootRef.modelName,
        path,
        rootModelId,
      ],
      enabled: Boolean(path && deps.rootModelDetails && rootModelId),
      queryFn: async (context): Promise<DataReferenceResolution> => {
        if (!deps.rootModelDetails) throw new Error('enabled check failed')

        const { client } = context
        const segments = R.pipe(path.split('.'), R.filter(R.isTruthy))

        if (segments.length === 0) {
          return {
            status: 'invalid',
            value: null,
            message: 'Reference path is empty.',
          }
        }

        let currentModel = rootRef
        let currentModelDetails = deps.rootModelDetails
        const visitedModelIds = new Set([
          toModelId(rootRef.appLabel, rootRef.modelName),
        ])
        let currentRecords = [
          { id: rootModelId, fields: deps.rootRecordFields },
        ]

        try {
          for (let index = 0; index < segments.length; index += 1) {
            const segment = segments[index]
            if (!segment) {
              return {
                status: 'invalid',
                value: null,
                message: 'Reference path is empty.',
              }
            }

            if (index === segments.length - 1) {
              return resolveFinalSegment(
                currentModel,
                currentModelDetails,
                currentRecords,
                segment,
              )
            }

            const relation = findRelationDefinition(
              currentModelDetails,
              segment,
            )
            if (!relation) {
              return {
                status: 'invalid',
                value: null,
                message: `Relation "${segment}" is not available on ${currentModel.appLabel}.${currentModel.modelName}.`,
              }
            }

            const relatedModel = splitModelId(relation.relatedModel)
            if (!relatedModel) {
              return {
                status: 'invalid',
                value: null,
                message: `Related model for "${segment}" could not be resolved.`,
              }
            }

            const nextId = toModelId(
              relatedModel.appLabel,
              relatedModel.modelName,
            )
            if (visitedModelIds.has(nextId)) {
              return {
                status: 'invalid',
                value: null,
                message: `Reference loops back to ${relatedModel.appLabel}.${relatedModel.modelName} and cannot be resolved.`,
              }
            }
            visitedModelIds.add(nextId)

            const nextRecords = relation.reverse
              ? await fetchReverseRelation(
                  client,
                  relation,
                  relatedModel,
                  currentRecords,
                )
              : await fetchForwardRelation(
                  client,
                  segment,
                  relatedModel,
                  currentRecords,
                )

            if (nextRecords.length === 0) {
              return {
                status: 'missing',
                value: null,
                message: `No related records found for "${segment}".`,
              }
            }

            currentRecords = R.pipe(
              nextRecords,
              R.uniqueBy(
                (record) => record.id || JSON.stringify(record.fields),
              ),
            )
            currentModel = relatedModel
            currentModelDetails = await client.fetchQuery(
              SCHEMA_QUERIES.modelDetails(relatedModel),
            )
          }
        } catch {
          return {
            status: 'unavailable',
            value: null,
            message: `Related data for "${path}" could not be loaded. Check the backend connection and try again.`,
          }
        }

        // Unreachable: the loop always returns on the final segment via
        // resolveFinalSegment. Satisfies TypeScript's control-flow analysis.
        return {
          status: 'invalid',
          value: null,
          message: `Reference "${path}" could not be resolved.`,
        }
      },
    }),
} as const

// ---------------------------------------------------------------------------
// Reference resolution helpers
// ---------------------------------------------------------------------------

/**
 * Terminates the path traversal by extracting field values from the
 * accumulated records. This is the last segment in a dotted path — it's a
 * data field, not a relation.
 *
 * When multiple records reached this point (e.g. a reverse relation branched
 * into N records), the field value is collected from each and returned as an
 * array.
 */
function resolveFinalSegment(
  currentModel: SchemaModelRef,
  currentModelDetails: ModelInfo,
  currentRecords: { id: string; fields: RecordFields }[],
  segment: string,
): DataReferenceResolution {
  const isKnownFinalSegment =
    isKnownSegment(currentModelDetails, segment) ||
    currentRecords.some((record) => hasDirectFieldKey(segment, record.fields))

  if (!isKnownFinalSegment) {
    return {
      status: 'invalid',
      value: null,
      message: `Field "${segment}" is not available on ${currentModel.appLabel}.${currentModel.modelName}.`,
    }
  }

  const values = R.pipe(
    currentRecords,
    R.map((record) => readDirectFieldValue(segment, record.fields)),
    R.filter(hasDisplayValue),
  )

  if (values.length === 0) {
    return {
      status: 'missing',
      value: null,
      message: `No value found for "${segment}" on the current record.`,
    }
  }

  return {
    status: 'resolved',
    value: values.length === 1 ? values[0] : values,
    field: findFieldDefinition(currentModelDetails, segment),
  }
}

/**
 * Traverses a reverse relation (One-to-Many / Many-to-Many).
 *
 * Queries the *related* model for records that point back to us via
 * `relation.relatedName`.
 */
async function fetchReverseRelation(
  client: QueryClient,
  relation: ModelInfo['relations'][number],
  relatedModel: SchemaModelRef,
  currentRecords: { id: string; fields: RecordFields }[],
) {
  const fetchPromises = currentRecords
    .map((record) => String(record.fields.id ?? record.id))
    .filter(Boolean)
    .map(async (currentRecordId) => {
      const relatedRecords = await client.fetchQuery(
        SCHEMA_QUERIES.records({
          ...relatedModel,
          filterFields: { [relation.relatedName]: currentRecordId },
        }),
      )
      return relatedRecords.results.map((relatedRecord) => ({
        id: String(relatedRecord.fields.id ?? ''),
        fields: relatedRecord.fields,
      }))
    })

  const results = await Promise.all(fetchPromises)
  return results.flat()
}

/**
 * Traverses a forward relation (Foreign Key / Many-to-One).
 *
 * Reads the FK value stored on each current record and fetches the
 * corresponding related record by ID.
 */
async function fetchForwardRelation(
  client: QueryClient,
  segment: string,
  relatedModel: SchemaModelRef,
  currentRecords: { id: string; fields: RecordFields }[],
) {
  const fetchPromises = currentRecords.flatMap((record) => {
    const relationValue = readDirectFieldValue(segment, record.fields)
    return toRecordIds(relationValue).map(async (recordId) => {
      const relatedRecord = await client.fetchQuery(
        SCHEMA_QUERIES.record({
          ...relatedModel,
          id: recordId,
        }),
      )
      return {
        id: recordId,
        fields: relatedRecord.fields,
      }
    })
  })

  return Promise.all(fetchPromises)
}
