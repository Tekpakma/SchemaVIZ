import { useQuery } from '@tanstack/react-query'
import { PlusIcon, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { QueryMetadataResponse } from '@/api/contracts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { BuilderDocumentActions } from '../builderWorkbench'
import { BUILDER_SCHEMA_QUERIES } from '../schemaModelQueries'
import type { RecipeFilter, RecipeModel } from '../types'

interface FiltersStepProps {
  actions: Pick<BuilderDocumentActions, 'addFilter' | 'removeFilter'>
  filters: RecipeFilter[]
  models: RecipeModel[]
}

type QLabField = QueryMetadataResponse['fields'][number]

function createBuilderId(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
}

function getModelLabel(model: RecipeModel) {
  return model.alias || model.displayName
}

function getFilterFieldName(field: QLabField) {
  return field.filterName || field.name
}

function getFilterableFields(metadata: QueryMetadataResponse | undefined) {
  return (metadata?.fields ?? []).filter(
    (field) => field.allowedOperations.length > 0,
  )
}

function coerceScalarValue(value: string, field: QLabField): unknown {
  const trimmed = value.trim()
  if (/^(true|false)$/i.test(trimmed)) return trimmed.toLowerCase() === 'true'
  if (/^null$/i.test(trimmed)) return null

  const normalizedType = field.type.toLowerCase()
  if (
    /^(integer|int|float|decimal|number)$/.test(normalizedType) &&
    trimmed !== ''
  ) {
    const parsed = Number(trimmed)
    return Number.isNaN(parsed) ? trimmed : parsed
  }

  return trimmed
}

function coerceFilterValue(value: string, operation: string, field: QLabField) {
  if (operation === 'isnull') {
    return value.trim() === '' ? true : Boolean(coerceScalarValue(value, field))
  }

  if (operation === 'in') {
    const values: unknown[] = []
    for (const entry of value.split(',')) {
      const coerced = coerceScalarValue(entry, field)
      if (coerced !== '') values.push(coerced)
    }
    return values
  }

  return coerceScalarValue(value, field)
}

function formatFilterValue(value: unknown) {
  return JSON.stringify(value)
}

function createQlabFilter(field: QLabField, operation: string, value: string) {
  const clause = {
    field: getFilterFieldName(field),
    op: operation,
    value: coerceFilterValue(value, operation, field),
  }

  return {
    filterFields: {
      andOperation: [clause],
    },
    expr: `${clause.field} ${operation} ${formatFilterValue(clause.value)}`,
  }
}

export function FiltersStep({ actions, filters, models }: FiltersStepProps) {
  const { t } = useTranslation()
  const [selectedModelId, setSelectedModelId] = useState(models[0]?.id ?? '')
  const [selectedFieldName, setSelectedFieldName] = useState('')
  const [selectedOperation, setSelectedOperation] = useState('')
  const [value, setValue] = useState('')

  const filterableModels = useMemo(() => models.slice(1), [models])
  const selectedModel = useMemo(
    () =>
      filterableModels.find((model) => model.id === selectedModelId) ??
      filterableModels[0] ??
      null,
    [filterableModels, selectedModelId],
  )
  const metadataQuery = useQuery(
    BUILDER_SCHEMA_QUERIES.queryMetadata(
      selectedModel?.appLabel ?? '',
      selectedModel?.modelName ?? '',
    ),
  )
  const fields = useMemo(
    () => getFilterableFields(metadataQuery.data),
    [metadataQuery.data],
  )
  const selectedField =
    fields.find((field) => getFilterFieldName(field) === selectedFieldName) ??
    fields[0] ??
    null
  const operations = selectedField?.allowedOperations ?? []
  const operation = operations.includes(selectedOperation)
    ? selectedOperation
    : operations[0] ?? ''
  const canAdd = Boolean(selectedModel && selectedField && operation)

  function handleAddFilter() {
    if (!selectedModel || !selectedField || !operation) return

    const { expr, filterFields } = createQlabFilter(
      selectedField,
      operation,
      value,
    )

    actions.addFilter({
      id: createBuilderId('filter'),
      layer: getModelLabel(selectedModel),
      expr,
      suggested: false,
      modelId: selectedModel.id,
      filterFields,
    })
    setValue('')
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[12.5px] leading-relaxed text-muted-foreground">
        {t('builder.filters.description')}
      </p>

      <div className="mt-1 flex flex-col gap-1.5">
        {filters.map((filter) => (
          <div
            key={filter.id}
            className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2"
          >
            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              {filter.layer}
            </span>
            <code className="min-w-0 flex-1 truncate text-[12px]">
              {filter.expr}
            </code>
            {filter.suggested ? (
              <span className="shrink-0 rounded bg-chart-2/15 px-2 py-0.5 text-[10px] text-chart-2">
                {t('builder.filters.suggestedBadge')}
              </span>
            ) : (
              <button
                type="button"
                className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={t('builder.filters.removeFilter')}
                onClick={() => actions.removeFilter(filter.id)}
                title={t('builder.filters.removeFilter')}
              >
                <X className="size-3" />
              </button>
            )}
          </div>
        ))}
      </div>

      {filters.length === 0 && (
        <p className="py-4 text-center text-[12px] text-muted-foreground">
          {t('builder.filters.empty')}
        </p>
      )}

      <div className="mt-2 grid gap-2">
        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-1 text-[11px] text-muted-foreground">
            {t('builder.filters.modelLabel')}
            <Select
              value={selectedModel?.id ?? ''}
              onValueChange={(nextModelId) => {
                setSelectedModelId(nextModelId)
                setSelectedFieldName('')
                setSelectedOperation('')
              }}
              disabled={filterableModels.length === 0}
            >
              <SelectTrigger className="h-8 w-full text-[12px]">
                <SelectValue placeholder={t('builder.filters.modelLabel')} />
              </SelectTrigger>
              <SelectContent>
                {filterableModels.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {getModelLabel(model)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="grid gap-1 text-[11px] text-muted-foreground">
            {t('builder.filters.fieldLabel')}
            <Select
              value={selectedField ? getFilterFieldName(selectedField) : ''}
              onValueChange={(fieldName) => {
                setSelectedFieldName(fieldName)
                setSelectedOperation('')
              }}
              disabled={!selectedModel || fields.length === 0}
            >
              <SelectTrigger className="h-8 w-full text-[12px]">
                <SelectValue placeholder={t('builder.filters.fieldLabel')} />
              </SelectTrigger>
              <SelectContent>
                {fields.map((field) => (
                  <SelectItem
                    key={getFilterFieldName(field)}
                    value={getFilterFieldName(field)}
                  >
                    {field.label || field.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        </div>

        <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_auto] items-end gap-2">
          <label className="grid gap-1 text-[11px] text-muted-foreground">
            {t('builder.filters.operatorLabel')}
            <Select
              value={operation}
              onValueChange={setSelectedOperation}
              disabled={!selectedField || operations.length === 0}
            >
              <SelectTrigger className="h-8 w-full font-mono text-[12px]">
                <SelectValue placeholder={t('builder.filters.operatorLabel')} />
              </SelectTrigger>
              <SelectContent>
                {operations.map((candidate) => (
                  <SelectItem key={candidate} value={candidate}>
                    {candidate}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="grid gap-1 text-[11px] text-muted-foreground">
            {t('builder.filters.valueLabel')}
            <Input
              className="h-8 font-mono text-[12px]"
              disabled={!selectedField}
              onChange={(event) => setValue(event.target.value)}
              placeholder={operation === 'in' ? 'prod,stage' : 'value'}
              value={value}
            />
          </label>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-[12px]"
            disabled={!canAdd || metadataQuery.isLoading}
            onClick={handleAddFilter}
          >
            <PlusIcon className="size-3.5" />
            {t('builder.filters.addFilter')}
          </Button>
        </div>
      </div>

      {metadataQuery.isError ? (
        <p className="text-[11px] text-destructive">
          {t('builder.filters.metadataError')}
        </p>
      ) : null}
    </div>
  )
}
