import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import {
  getCanvasNodeIdsSnapshot,
  getCanvasNodesSnapshot,
} from '@/store/canvasStore'
import {
  createHelperLineCandidates,
  snapFrameToHelperLines,
} from '../helperLines'
import type {
  CanvasHelperLine,
  CanvasHelperLineCandidate,
  CanvasHelperLineSnapOptions,
  CanvasNodeFrame,
} from '../helperLines'
import type { CanvasNode, NodeId } from '../model/types'

type CanvasHelperLinesContextValue = {
  activeLines: Array<CanvasHelperLine>
  clearHelperLines: () => void
  isEnabled: boolean
  snapFrame: (
    frame: CanvasNodeFrame,
    options?: CanvasHelperLineSnapOptions,
  ) => {
    x: number
    y: number
  }
  toggleHelperLines: () => void
}

const CanvasHelperLinesContext =
  createContext<CanvasHelperLinesContextValue | null>(null)

type CanvasHelperLinesProviderProps = {
  children: ReactNode
}

type CandidateCache = {
  nodeIds: Array<NodeId>
  nodesById: Record<NodeId, CanvasNode>
  candidates: Array<CanvasHelperLineCandidate>
}

function haveSameHelperLines(
  left: Array<CanvasHelperLine>,
  right: Array<CanvasHelperLine>,
) {
  if (left.length !== right.length) return false

  for (let index = 0; index < left.length; index += 1) {
    const leftLine = left[index]
    const rightLine = right[index]
    if (
      !leftLine ||
      !rightLine ||
      leftLine.orientation !== rightLine.orientation ||
      leftLine.position !== rightLine.position ||
      leftLine.targetNodeId !== rightLine.targetNodeId ||
      leftLine.targetAnchorName !== rightLine.targetAnchorName
    ) {
      return false
    }
  }

  return true
}

export function CanvasHelperLinesProvider({
  children,
}: CanvasHelperLinesProviderProps) {
  const [activeLines, setActiveLines] = useState<Array<CanvasHelperLine>>([])
  const [isEnabled, setIsEnabled] = useState(true)
  const candidateCacheRef = useRef<CandidateCache | null>(null)

  const clearHelperLines = useCallback(() => {
    setActiveLines((current) => (current.length === 0 ? current : []))
  }, [])

  const toggleHelperLines = useCallback(() => {
    clearHelperLines()
    setIsEnabled((current) => !current)
  }, [clearHelperLines])

  const getSnapCandidates = useCallback(() => {
    const nodeOrder = getCanvasNodeIdsSnapshot()
    const nodesById = getCanvasNodesSnapshot()
    const cached = candidateCacheRef.current

    if (
      cached &&
      cached.nodeIds === nodeOrder &&
      cached.nodesById === nodesById
    ) {
      return cached.candidates
    }

    const candidates = createHelperLineCandidates({
      nodeIds: nodeOrder,
      nodes: nodesById,
    })

    candidateCacheRef.current = {
      nodeIds: nodeOrder,
      nodesById,
      candidates,
    }

    return candidates
  }, [])

  const snapFrame = useCallback(
    (frame: CanvasNodeFrame, options: CanvasHelperLineSnapOptions = {}) => {
      if (!isEnabled) {
        clearHelperLines()
        return {
          x: frame.x,
          y: frame.y,
        }
      }

      const candidates = getSnapCandidates()
      const result = snapFrameToHelperLines({
        candidates,
        excludeNodeIds: options.excludeNodeIds,
        frame,
      })

      setActiveLines((current) =>
        haveSameHelperLines(current, result.lines) ? current : result.lines,
      )

      return {
        x: result.x,
        y: result.y,
      }
    },
    [clearHelperLines, getSnapCandidates, isEnabled],
  )

  const value = useMemo(
    () => ({
      activeLines,
      clearHelperLines,
      isEnabled,
      snapFrame,
      toggleHelperLines,
    }),
    [activeLines, clearHelperLines, isEnabled, snapFrame, toggleHelperLines],
  )

  return (
    <CanvasHelperLinesContext.Provider value={value}>
      {children}
    </CanvasHelperLinesContext.Provider>
  )
}

export function useCanvasHelperLines() {
  const context = useContext(CanvasHelperLinesContext)
  if (!context) {
    throw new Error(
      'useCanvasHelperLines must be used within CanvasHelperLinesProvider',
    )
  }

  return context
}
