import { createContext, use } from 'react'
import type { CanvasNode, NodeId } from '@/features/canvas/model/types'
import type { CanvasNodeShapeDefinition } from '@/features/canvas/nodeShapes'
import type { SchemaModelRef } from './dataReference/schemaQueries'

export type LexicalOverlayDataScope = SchemaModelRef & {
  recordId?: string
}

export type LexicalOverlayRuntime = {
  nodeId: NodeId
  node: CanvasNode
  shapeDefinition: CanvasNodeShapeDefinition
  dataScope?: LexicalOverlayDataScope
}

const LexicalOverlayRuntimeContext =
  createContext<LexicalOverlayRuntime | null>(null)

export const LexicalOverlayRuntimeProvider =
  LexicalOverlayRuntimeContext.Provider

/** Runtime metadata shared by the active lexical overlay, plugins, and future decorator nodes. */
export function useLexicalOverlayRuntime() {
  const runtime = use(LexicalOverlayRuntimeContext)

  if (!runtime) {
    throw new Error(
      'useLexicalOverlayRuntime must be used inside LexicalOverlayRuntimeProvider',
    )
  }

  return runtime
}

/**
 * Non-throwing variant. Returns `null` when no provider is present OR when
 * the provider is intentionally passing `null` (e.g. the persistent
 * BuilderInlineEditor before/after an edit session).
 *
 * Use this for components rendered inside the editor's contenteditable
 * (e.g. {@link DataReferenceChip}) that need to gracefully degrade when
 * no data scope is available.
 */
export function useOptionalLexicalOverlayRuntime() {
  return use(LexicalOverlayRuntimeContext)
}
