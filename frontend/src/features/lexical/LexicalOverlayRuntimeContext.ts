import { createContext, useContext } from 'react'
import type { CanvasBoxNode, NodeId } from '@/features/canvas/model/types'
import type { CanvasNodeShapeDefinition } from '@/features/canvas/nodeShapes'

export type LexicalOverlayDataScope = {
  appLabel: string
  modelName: string
  recordId?: string
}

export type LexicalOverlayRuntime = {
  nodeId: NodeId
  node: CanvasBoxNode
  shapeDefinition: CanvasNodeShapeDefinition
  dataScope: LexicalOverlayDataScope
}

const LexicalOverlayRuntimeContext =
  createContext<LexicalOverlayRuntime | null>(null)

export const LexicalOverlayRuntimeProvider =
  LexicalOverlayRuntimeContext.Provider

/** Runtime metadata shared by the active lexical overlay, plugins, and future decorator nodes. */
export function useLexicalOverlayRuntime() {
  const runtime = useContext(LexicalOverlayRuntimeContext)

  if (!runtime) {
    throw new Error(
      'useLexicalOverlayRuntime must be used inside LexicalOverlayRuntimeProvider',
    )
  }

  return runtime
}
