import type { ModelInfo } from '@/api/contracts'
import type { RecordFields } from './fieldValues'
import {
  findFieldDefinition,
  hasDirectFieldKey,
  hasDisplayValue,
  isKnownSegment,
  readDirectFieldValue,
} from './fieldValues'

export type DataReferenceResolution =
  | { status: 'resolved'; value: unknown; field?: ModelInfo['fields'][number] }
  | { status: 'missing'; value: null; message: string }
  | { status: 'invalid'; value: null; message: string }
  | { status: 'unavailable'; value: null; message: string }

/**
 * Synchronously resolves a flat field reference against a loaded record.
 *
 * Use for immediate resolution of non-dotted paths (e.g. "firstName") where no
 * network traversal is required.
 */
export function resolveDirectReference({
  fieldName,
  rootRecordFields,
  rootModelDetails,
}: {
  fieldName: string
  rootRecordFields: RecordFields
  rootModelDetails: ModelInfo
}): DataReferenceResolution {
  const directValue = readDirectFieldValue(fieldName, rootRecordFields)
  const isKnown =
    isKnownSegment(rootModelDetails, fieldName) ||
    hasDirectFieldKey(fieldName, rootRecordFields)

  if (!isKnown) {
    return {
      status: 'invalid',
      value: null,
      message: `Field "${fieldName}" is not available on ${rootModelDetails.appLabel}.${rootModelDetails.modelName}.`,
    }
  }

  if (!hasDisplayValue(directValue)) {
    return {
      status: 'missing',
      value: null,
      message: `No value found for "${fieldName}" on the current record.`,
    }
  }

  return {
    status: 'resolved',
    value: directValue,
    field: findFieldDefinition(rootModelDetails, fieldName),
  }
}
