import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import uFuzzy from '@leeoniya/ufuzzy'
import type { ModelInfo } from '@/api/contracts'
import { SCHEMA_QUERIES } from './schemaQueries'
import type { SchemaModelRef } from './schemaQueries'
import { splitModelId, toModelId } from './modelUtils'

export type DataReferenceSuggestion = {
  fieldName: string
  label: string
  description: string
  type: string
  source: 'field' | 'relation' | 'relation-root'
}

type SuggestionOptions = {
  includeRelationRoots?: boolean
}

const fuzzy = new uFuzzy()

/**
 * Splits a user-typed search string into a relation path and a terminal term.
 *
 * - `"email"`        → `{ relationPath: [], term: "email" }`
 * - `"author.email"` → `{ relationPath: ["author"], term: "email" }`
 * - `"author."`      → `{ relationPath: ["author"], term: "" }` (trailing dot = show all fields)
 */
function parseSearchTerm(searchTerm: string) {
  const trimmed = searchTerm.trim()
  if (!trimmed.includes('.')) {
    return { relationPath: [], term: trimmed }
  }

  const segments = trimmed.split('.').map((segment) => segment.trim())
  if (trimmed.endsWith('.')) {
    return { relationPath: segments.filter(Boolean), term: '' }
  }

  return {
    relationPath: segments.slice(0, -1).filter(Boolean),
    term: segments.at(-1) ?? '',
  }
}

function buildFieldSuggestions(
  fields: ModelInfo['fields'],
  prefix?: string,
): DataReferenceSuggestion[] {
  const normalizedPrefix = prefix ? `${prefix}.` : ''
  return fields.map((field) => ({
    fieldName: `${normalizedPrefix}${field.name}`,
    label: `${normalizedPrefix}${field.name}`,
    description: field.verboseName || field.type,
    type: field.type,
    source: prefix ? 'relation' : 'field',
  }))
}

/**
 * Creates suggestion entries for relations themselves (not their fields).
 *
 * Each entry's `fieldName` ends with a trailing dot (e.g. `"author."`) to
 * signal an incomplete path — selecting it drills into that relation rather
 * than completing the reference.
 */
function buildRelationRootSuggestions(
  relations: ModelInfo['relations'],
  prefix?: string,
): DataReferenceSuggestion[] {
  const normalizedPrefix = prefix ? `${prefix}.` : ''
  return relations.map((relation) => ({
    fieldName: `${normalizedPrefix}${relation.name}.`,
    label: relation.name,
    description: 'Relation',
    type: 'relation',
    source: 'relation-root',
  }))
}

/** Filters and ranks suggestions by fuzzy relevance. Returns all when search is empty. */
function filterSuggestions(
  suggestions: DataReferenceSuggestion[],
  search: string,
): DataReferenceSuggestion[] {
  if (!search) return suggestions

  const haystack = suggestions.map(
    (s) => `${s.fieldName} ${s.label} ${s.description}`,
  )
  const [idxs, , order] = fuzzy.search(haystack, search)

  if (!idxs || !order) return []
  return order.map((i) => suggestions[idxs[i]!]!)
}

export function useDataReferenceSuggestions(
  modelRef: SchemaModelRef,
  searchTerm: string,
  options: SuggestionOptions = {},
) {
  const includeRelationRoots = options.includeRelationRoots ?? false

  const { data: rootModelDetails } = useSuspenseQuery(
    SCHEMA_QUERIES.modelDetails(modelRef),
  )

  const parsedSearch = parseSearchTerm(searchTerm)

  const relationPathTargetQuery = useQuery(
    SCHEMA_QUERIES.relationPathTarget(modelRef, parsedSearch.relationPath, {
      rootModelDetails,
    }),
  )

  if (parsedSearch.relationPath.length === 0) {
    const direct = buildFieldSuggestions(rootModelDetails.fields)
    if (!includeRelationRoots) {
      return filterSuggestions(direct, searchTerm)
    }
    const visitedModelIds = new Set<string>([
      toModelId(rootModelDetails.appLabel, rootModelDetails.modelName),
    ])
    const relationRoots = buildRelationRootSuggestions(
      rootModelDetails.relations.filter((relation) => {
        const related = splitModelId(relation.relatedModel)
        if (!related) return false
        return !visitedModelIds.has(
          toModelId(related.appLabel, related.modelName),
        )
      }),
    )
    return filterSuggestions([...direct, ...relationRoots], searchTerm)
  }

  const targetData = relationPathTargetQuery.data
  if (!targetData) return []

  const relationPrefix = parsedSearch.relationPath.join('.')
  const relationFields = buildFieldSuggestions(
    targetData.model.fields,
    relationPrefix,
  )
  const deeperRelationRoots = includeRelationRoots
    ? buildRelationRootSuggestions(
        targetData.model.relations.filter((relation) => {
          const related = splitModelId(relation.relatedModel)
          if (!related) return false
          return !targetData.visitedModelIds.includes(
            toModelId(related.appLabel, related.modelName),
          )
        }),
        relationPrefix,
      )
    : []

  return filterSuggestions(
    [...relationFields, ...deeperRelationRoots],
    parsedSearch.term,
  )
}
