import { Line } from 'react-konva'
import { CANVAS_HELPER_LINE_COLOR } from '../themeColors'
import { useCanvasHelperLines } from '../hooks/useCanvasHelperLines'
import type { CanvasViewport } from '@/store/canvasStore'

type CanvasHelperLinesProps = {
  viewport: CanvasViewport
  stageSize: {
    width: number
    height: number
  }
}

export function CanvasHelperLines({
  viewport,
  stageSize,
}: CanvasHelperLinesProps) {
  const { activeLines } = useCanvasHelperLines()
  if (activeLines.length === 0 || viewport.scale === 0) return null

  const left = -viewport.x / viewport.scale
  const top = -viewport.y / viewport.scale
  const right = (stageSize.width - viewport.x) / viewport.scale
  const bottom = (stageSize.height - viewport.y) / viewport.scale

  return (
    <>
      {activeLines.map((line) => (
        <Line
          key={`${line.orientation}:${line.position}:${line.targetNodeId}:${line.targetAnchorName}`}
          points={
            line.orientation === 'vertical'
              ? [line.position, top, line.position, bottom]
              : [left, line.position, right, line.position]
          }
          stroke={CANVAS_HELPER_LINE_COLOR}
          strokeWidth={1}
          strokeScaleEnabled={false}
          listening={false}
        />
      ))}
    </>
  )
}
