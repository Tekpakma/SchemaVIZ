import type { LayoutResult } from 'render-tag'

type LayoutTreeNode =
  | LayoutResult['layoutRoot']
  | LayoutResult['layoutRoot']['children'][number]

export type RenderTagTextBounds = {
  top: number
  bottom: number
}

/**
 * Measures the vertical span of non-empty text in a render-tag layout.
 * render-tag positions text by baseline, so the bounds approximate each
 * line box from font size/line height instead of using the layout root height.
 */
export function getRenderTagTextBounds(
  layoutResult: LayoutResult,
): RenderTagTextBounds | null {
  let top = Number.POSITIVE_INFINITY
  let bottom = Number.NEGATIVE_INFINITY

  const visit = (layoutNode: LayoutTreeNode) => {
    if (layoutNode.type === 'text') {
      if (!layoutNode.text.trim()) return

      const lineHeight =
        layoutNode.style.lineHeight || layoutNode.style.fontSize * 1.2

      top = Math.min(top, layoutNode.y - lineHeight * 0.8)
      bottom = Math.max(bottom, layoutNode.y + lineHeight * 0.2)
      return
    }

    layoutNode.children.forEach(visit)
  }

  visit(layoutResult.layoutRoot)

  if (!Number.isFinite(top) || !Number.isFinite(bottom)) return null

  return {
    top,
    bottom,
  }
}
