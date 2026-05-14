import { memo, useMemo } from 'react'
import { Shape } from 'react-konva'

import { useTheme } from '@/features/theme/useTheme'
import {
  resolveCanvasThemeColor,
  CANVAS_EDGE_LABEL_TEXT_FALLBACK,
  CANVAS_EDGE_LABEL_TEXT_VARIABLE,
} from '@/features/canvas/themeColors'
import type { BuilderPreviewColumn } from './builderPreviewLayout'
import { BUILDER_PREVIEW_STAGE_HEIGHT } from './builderPreviewLayout'

const HEADER_Y = 18
const HEADER_FONT_SIZE = 9
const COLUMN_CORNER_RADIUS = 10
const COLUMN_TOP_PADDING = 8

type BuilderPreviewColumnsProps = {
  columns: BuilderPreviewColumn[]
}

export const BuilderPreviewColumns = memo(function BuilderPreviewColumns({
  columns,
}: BuilderPreviewColumnsProps) {
  const { resolvedTheme } = useTheme()

  const labelColor = useMemo(
    () =>
      resolveCanvasThemeColor({
        fallback: CANVAS_EDGE_LABEL_TEXT_FALLBACK[resolvedTheme],
        variableName: CANVAS_EDGE_LABEL_TEXT_VARIABLE,
      }),
    [resolvedTheme],
  )

  if (columns.length === 0) return null

  return (
    <Shape
      listening={false}
      sceneFunc={(context) => {
        const ctx = context._context
        ctx.save()

        for (const col of columns) {
          ctx.fillStyle =
            resolvedTheme === 'dark'
              ? 'rgba(255, 255, 255, 0.025)'
              : 'rgba(0, 0, 0, 0.02)'
          ctx.beginPath()
          ctx.roundRect(
            col.x,
            COLUMN_TOP_PADDING,
            col.width,
            BUILDER_PREVIEW_STAGE_HEIGHT - COLUMN_TOP_PADDING * 2,
            COLUMN_CORNER_RADIUS,
          )
          ctx.fill()

          // Accent stripe at top of column
          ctx.fillStyle = col.accent
          ctx.globalAlpha = 0.6
          ctx.beginPath()
          ctx.roundRect(
            col.x + col.width / 2 - 16,
            COLUMN_TOP_PADDING,
            32,
            3,
            [1.5, 1.5, 1.5, 1.5],
          )
          ctx.fill()
          ctx.globalAlpha = 1
        }

        // Draw column header labels
        ctx.font = `600 ${HEADER_FONT_SIZE}px ui-monospace, SFMono-Regular, Menlo, monospace`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillStyle = labelColor
        ctx.globalAlpha = 0.48
        ctx.letterSpacing = '1.4px'

        for (const col of columns) {
          ctx.fillText(
            `LAYER ${col.index + 1}`,
            col.x + col.width / 2,
            HEADER_Y,
          )
        }

        ctx.restore()
      }}
    />
  )
})
