import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import {
  useCanvasNodeIds,
  useCanvasNodes,
} from '@/store/canvasStore'
import { snapFrameToHelperLines } from '../helperLines'
import type {
  CanvasHelperLine,
  CanvasHelperLineSnapOptions,
  CanvasNodeFrame,
} from '../helperLines'

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
  const nodes = useCanvasNodes()
  const nodeIds = useCanvasNodeIds()
  const [activeLines, setActiveLines] = useState<Array<CanvasHelperLine>>([])
  const [isEnabled, setIsEnabled] = useState(true)

  const clearHelperLines = useCallback(() => {
    setActiveLines((current) => (current.length === 0 ? current : []))
  }, [])

  const toggleHelperLines = useCallback(() => {
    clearHelperLines()
    setIsEnabled((current) => !current)
  }, [clearHelperLines])

  const snapFrame = useCallback(
    (frame: CanvasNodeFrame, options: CanvasHelperLineSnapOptions = {}) => {
      if (!isEnabled) {
        clearHelperLines()
        return {
          x: frame.x,
          y: frame.y,
        }
      }

      const result = snapFrameToHelperLines({
        excludeNodeIds: options.excludeNodeIds,
        frame,
        nodeIds,
        nodes,
      })

      setActiveLines((current) =>
        haveSameHelperLines(current, result.lines) ? current : result.lines,
      )

      return {
        x: result.x,
        y: result.y,
      }
    },
    [clearHelperLines, isEnabled, nodeIds, nodes],
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
