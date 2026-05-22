import { Component, Suspense, useEffect, useMemo, useRef } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useLexicalNodeSelection } from '@lexical/react/useLexicalNodeSelection'
import { mergeRegister } from '@lexical/utils'
import { useSuspenseQuery } from '@tanstack/react-query'
import { CLICK_COMMAND, COMMAND_PRIORITY_LOW } from 'lexical'
import { cn } from '@/lib/utils'
import { useShowResolvedReferences } from '@/store/canvasStore'
import { useOptionalLexicalOverlayRuntime } from '../LexicalOverlayRuntimeContext'
import type { LexicalOverlayDataScope } from '../LexicalOverlayRuntimeContext'
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
  const [editor] = useLexicalComposerContext()
  const [isSelected, setSelected, clearSelection] =
    useLexicalNodeSelection(nodeKey)
  const chipRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        CLICK_COMMAND,
        (event: MouseEvent) => {
          const target = event.target
          if (
            !(target instanceof globalThis.Node) ||
            !chipRef.current?.contains(target)
          ) {
            return false
          }

          event.preventDefault()
          if (!event.shiftKey) clearSelection()
          setSelected(!isSelected)
          return true
        },
        COMMAND_PRIORITY_LOW,
      ),
    )
  }, [clearSelection, editor, isSelected, setSelected])

  return (
    <span
      ref={chipRef}
      data-data-reference={fieldName}
      data-node-key={nodeKey}
      data-selected={isSelected ? 'true' : undefined}
      contentEditable={false}
      className={cn(
        'relative inline-flex items-center rounded-sm bg-primary/10 px-1 py-0 align-baseline select-none text-sm font-mono transition-colors duration-150',
        isSelected &&
          'bg-primary/15 after:pointer-events-none after:absolute after:-bottom-0.5 after:inset-x-0 after:h-0.5 after:rounded-full after:bg-primary',
      )}
      style={styles}
    >
      {children}
    </span>
  )
}

function ResolvedChipContentInner({
  dataScope,
  fieldName,
}: {
  dataScope: LexicalOverlayDataScope
  fieldName: string
}) {
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

function ResolvedChipContent({ fieldName }: { fieldName: string }) {
  // Non-throwing variant: the chip may be rendered inside a persistent
  // editor (BuilderInlineEditor) that doesn't always have a non-null
  // runtime — e.g. when no node is being edited. Fall back to the
  // template form so the chip still displays sensibly.
  const runtime = useOptionalLexicalOverlayRuntime()
  const dataScope = runtime?.dataScope
  // We need BOTH a data scope AND a concrete recordId to actually
  // resolve a value. Builder preview nodes have a scope (app/model)
  // but no record — show the template form there instead of firing
  // a record fetch that the backend will reject with "id is required".
  if (!dataScope?.recordId) return <>{`{{${fieldName}}}`}</>
  return (
    <ResolvedChipContentInner dataScope={dataScope} fieldName={fieldName} />
  )
}

/**
 * Last-resort error boundary around the resolved chip content. If any
 * downstream query fails (e.g. a missing record, schema mismatch) we
 * degrade to the template form instead of letting a single chip crash
 * the entire editor.
 */
class ChipErrorBoundary extends Component<
  { fieldName: string; children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn(
      '[DataReferenceChip] resolution failed; showing template fallback',
      {
        fieldName: this.props.fieldName,
        error,
        info,
      },
    )
  }
  render() {
    if (this.state.hasError) return <>{`{{${this.props.fieldName}}}`}</>
    return this.props.children
  }
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
      <ChipErrorBoundary fieldName={fieldName}>
        <Suspense fallback={templateFallback}>
          <ResolvedChipContent fieldName={fieldName} />
        </Suspense>
      </ChipErrorBoundary>
    </ChipShell>
  )
}
