import { createContext, useContext } from 'react'
import type { NodeId } from '../model/types'

const ActiveCanvasNodeContext = createContext<NodeId | null>(null)

export const ActiveCanvasNodeProvider = ActiveCanvasNodeContext.Provider
// Decoupling the active node id from the canvas store allows us to use it in more places without causing unnecessary re-renders of the entire canvas when the active node changes.
export function useActiveCanvasNodeId() {
  const nodeId = useContext(ActiveCanvasNodeContext)
  if (!nodeId) {
    throw new Error(
      'useActiveCanvasNodeId must be used inside ActiveCanvasNodeProvider',
    )
  }
  return nodeId
}
