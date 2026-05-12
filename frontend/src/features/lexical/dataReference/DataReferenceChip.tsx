import { Suspense, useMemo } from 'react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useShowResolvedReferences } from '@/store/canvasStore'
import { useLexicalOverlayRuntime } from '../LexicalOverlayRuntimeContext'
import { SCHEMA_QUERIES } from './schemaQueries'
import { formatReferenceDisplayValue } from './fieldValues'
import type { DataReferenceInlineStyle } from './DataReferenceNode'

type ChipProps = {
  fieldName: string
  nodeKey: string
  styles: DataReferenceInlineStyle
}

function ChipShell({
  fieldName,
  nodeKey,
  styles,
  children,
}: ChipProps & { children: React.ReactNode }) {
  return (
    <span
      data-data-reference={fieldName}
      data-node-key={nodeKey}
      contentEditable={false}
      className="inline-flex items-center rounded-sm bg-primary/10 px-1 py-0 align-baseline select-none text-sm font-mono"
      style={styles}
    >
      {children}
    </span>
  )
}

function ResolvedChipContent({ fieldName }: { fieldName: string }) {
  const { dataScope } = useLexicalOverlayRuntime()

  const rootRef = useMemo(
    () => ({ appLabel: dataScope.appLabel, modelName: dataScope.modelName }),
    [dataScope.appLabel, dataScope.modelName],
  )

  const { data: modelDetails } = useSuspenseQuery(
    SCHEMA_QUERIES.modelDetails(rootRef),
  )

  const { data: recordData } = useSuspenseQuery(
    SCHEMA_QUERIES.record({ ...rootRef, id: dataScope.recordId }),
  )

  const { data: resolution } = useSuspenseQuery(
    SCHEMA_QUERIES.referenceResolution(
      rootRef,
      fieldName,
      dataScope.recordId ?? '',
      {
        rootModelDetails: modelDetails,
        rootRecordFields: recordData.fields,
      },
    ),
  )

  const displayText =
    resolution.status === 'resolved'
      ? formatReferenceDisplayValue(resolution.value, resolution.field)
      : `{{${fieldName}}}`

  return <>{displayText}</>
}

export function DataReferenceChip({ fieldName, nodeKey, styles }: ChipProps) {
  const showResolved = useShowResolvedReferences()

  const templateFallback = `{{${fieldName}}}`

  if (!showResolved) {
    return (
      <ChipShell fieldName={fieldName} nodeKey={nodeKey} styles={styles}>
        {templateFallback}
      </ChipShell>
    )
  }

  return (
    <ChipShell fieldName={fieldName} nodeKey={nodeKey} styles={styles}>
      <Suspense fallback={templateFallback}>
        <ResolvedChipContent fieldName={fieldName} />
      </Suspense>
    </ChipShell>
  )
}
