import { regex } from 'arkregex'
import * as R from 'remeda'

import type { ModelInfo } from '@/api/contracts'
import { hasKey } from '#/utils/helper'

type FieldInfo = ModelInfo['fields'][number]
type RelationInfo = ModelInfo['relations'][number]
type DateFieldKind = 'date' | 'datetime'

export type RecordFields = Record<string, unknown>

// ---------------------------------------------------------------------------
// Indexed model info
// ---------------------------------------------------------------------------

/**
 * `ModelInfo` augmented with pre-computed lookup structures for O(1) field
 * and relation access. Created once per model when fetched and cached by
 * React Query — all downstream consumers automatically get the fast path.
 */
export type IndexedModelInfo = ModelInfo & {
  fieldsByName: Map<string, FieldInfo>
  relationsByName: Map<string, RelationInfo>
  knownSegments: Set<string>
}

/** Augments a raw `ModelInfo` with Map/Set indexes for O(1) lookups. */
export function indexModelInfo(model: ModelInfo): IndexedModelInfo {
  return {
    ...model,
    fieldsByName: new Map(model.fields.map((f) => [f.name, f])),
    relationsByName: new Map(model.relations.map((r) => [r.name, r])),
    knownSegments: new Set([
      ...model.fields.map((f) => f.name),
      ...model.relations.map((r) => r.name),
    ]),
  }
}

function isIndexed(model: ModelInfo): model is IndexedModelInfo {
  return 'fieldsByName' in model
}

// ---------------------------------------------------------------------------
// Schema lookups
// ---------------------------------------------------------------------------

export function findFieldDefinition(
  modelDetails: ModelInfo,
  fieldName: string,
) {
  if (isIndexed(modelDetails)) return modelDetails.fieldsByName.get(fieldName)
  return modelDetails.fields.find((field) => field.name === fieldName)
}

export function findRelationDefinition(
  modelDetails: ModelInfo,
  relationName: string,
) {
  if (isIndexed(modelDetails)) {
    return modelDetails.relationsByName.get(relationName)
  }
  return modelDetails.relations.find(
    (relation) => relation.name === relationName,
  )
}

export function isKnownSegment(
  modelDetails: ModelInfo,
  segment: string,
) {
  if (isIndexed(modelDetails)) return modelDetails.knownSegments.has(segment)
  return (
    modelDetails.fields.some((field) => field.name === segment) ||
    modelDetails.relations.some((relation) => relation.name === segment)
  )
}

// ---------------------------------------------------------------------------
// Record field access
// ---------------------------------------------------------------------------

/**
 * Reads a direct field value from the record.
 *
 * Checks `fieldName` first, then falls back to `${fieldName}_id`.
 */
export function readDirectFieldValue(
  fieldName: string,
  fields: RecordFields,
) {
  if (Object.hasOwn(fields, fieldName)) {
    return fields[fieldName]
  }

  const idFieldName = `${fieldName}_id`

  if (Object.hasOwn(fields, idFieldName)) {
    return fields[idFieldName]
  }

  return undefined
}

/**
 * Returns whether the record contains either `fieldName`
 * or its direct ID variant `${fieldName}_id`.
 */
export function hasDirectFieldKey(
  fieldName: string,
  fields: RecordFields,
) {
  return (
    Object.hasOwn(fields, fieldName) ||
    Object.hasOwn(fields, `${fieldName}_id`)
  )
}

// ---------------------------------------------------------------------------
// Value coercion helpers
// ---------------------------------------------------------------------------

/**
 * Coerces an arbitrary field value into a flat array of record ID strings.
 *
 * Handles the various shapes a FK/M2M value can take from the backend:
 * a bare ID, an array of IDs, an object with `id`/`pk`, or nested combinations.
 */
export function toRecordIds(value: unknown): string[] {
  if (R.isEmptyish(value)) return []

  if (R.isArray(value)) {
    return value.flatMap(toRecordIds)
  }

  if (R.isPlainObject(value)) {
    if (hasKey(value, 'id')) return toRecordIds(value.id)
    if (hasKey(value, 'pk')) return toRecordIds(value.pk)

    return []
  }

  return [String(value)]
}

export function hasDisplayValue(value: unknown) {
  return !R.isEmptyish(value)
}

export function formatDisplayValue(value: unknown): string {
  if (R.isArray(value)) {
    return value.map(formatDisplayValue).filter(Boolean).join(', ')
  }

  if (R.isNullish(value)) return ''
  if (R.isObjectType(value)) return JSON.stringify(value)

  return String(value)
}

// ---------------------------------------------------------------------------
// Date formatting
// ---------------------------------------------------------------------------

const DATE_FIELD_TYPES = new Set(['datefield', 'date'])
const DATE_TIME_FIELD_TYPES = new Set(['datetimefield', 'datetime'])

const LOCAL_DATE_PATTERN = regex(
  '^(?<year>\\d{4})-(?<month>\\d{2})-(?<day>\\d{2})$',
)

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
})

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

/**
 * Determines whether a field represents a date or datetime based on its
 * backend type string. Falls back to a substring heuristic for non-standard
 * type names (e.g. "CustomDateTimeField" matches because it contains both
 * "date" and "time").
 */
function getDateFieldKind(field: FieldInfo | undefined): DateFieldKind | null {
  const type = field?.type.toLowerCase()
  if (!type) return null

  if (DATE_FIELD_TYPES.has(type)) return 'date'

  if (
    DATE_TIME_FIELD_TYPES.has(type) ||
    (type.includes('date') && type.includes('time'))
  ) {
    return 'datetime'
  }

  return null
}

/**
 * Parses a `YYYY-MM-DD` string into a local Date without timezone shift.
 *
 * Unlike `new Date("2024-06-15")` which parses as UTC midnight (and can
 * shift to the previous day in western timezones), this constructs the date
 * with local year/month/day components. Also rejects invalid calendar dates
 * (e.g. Feb 31) that JS `Date` would silently roll forward.
 */
function parseLocalDateOnly(value: string): Date | null {
  const match = LOCAL_DATE_PATTERN.exec(value)
  if (!match?.groups) return null

  const year = Number(match.groups.year)
  const month = Number(match.groups.month)
  const day = Number(match.groups.day)

  const date = new Date(year, month - 1, day)

  // Prevent JS rollover: 2024-02-31 -> 2024-03-02
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null
  }

  return date
}

function parseDateValue(value: unknown, kind: DateFieldKind): Date | null {
  if (R.isDate(value)) return value

  if (kind === 'date' && R.isString(value)) {
    return parseLocalDateOnly(value)
  }

  if (R.isString(value) || R.isNumber(value)) {
    return new Date(value)
  }

  return null
}

function isValidDate(value: Date) {
  return !Number.isNaN(value.getTime())
}

function formatDateValue(
  value: unknown,
  field: FieldInfo | undefined,
): string | null {
  const kind = getDateFieldKind(field)
  if (!kind) return null

  const date = parseDateValue(value, kind)
  if (!date || !isValidDate(date)) return null

  return kind === 'datetime'
    ? dateTimeFormatter.format(date)
    : dateFormatter.format(date)
}

// ---------------------------------------------------------------------------
// Choice formatting
// ---------------------------------------------------------------------------

/**
 * Resolves a raw choice value to its human-readable label.
 *
 * Looks up the value in the field's `choices` array and returns the first
 * available display string: `display` → `label` → raw value as fallback.
 * Returns `null` when the field has no choices or the value doesn't match.
 */
function formatChoiceValue(
  value: unknown,
  field: FieldInfo | undefined,
): string | null {
  if (!field?.choices?.length) return null

  const valueKey = String(value)

  const choice = field.choices.find((item) => String(item.value) === valueKey)

  if (!choice) return null
  if (R.isString(choice.display)) return choice.display
  if (R.isString(choice.label)) return choice.label

  return valueKey
}

// ---------------------------------------------------------------------------
// Public display API
// ---------------------------------------------------------------------------

export function formatReferenceDisplayValue(
  value: unknown,
  field?: FieldInfo,
): string {
  if (R.isArray(value)) {
    return value
      .map((entry) => formatReferenceDisplayValue(entry, field))
      .filter(Boolean)
      .join(', ')
  }

  return (
    formatChoiceValue(value, field) ??
    formatDateValue(value, field) ??
    formatDisplayValue(value)
  )
}
