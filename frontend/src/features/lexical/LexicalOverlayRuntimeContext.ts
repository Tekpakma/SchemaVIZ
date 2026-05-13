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
