import type { LexicalEditor } from 'lexical'
import { $generateHtmlFromNodes } from '@lexical/html'
import type { CSSProperties } from 'react'

export const renderTagAccuracy = 'balanced'

export const renderTagEditorStyle = {
  boxSizing: 'border-box',
  width: '100%',
  height: '100%',
  minHeight: '100%',
  margin: 0,
  padding: 10,
  outline: 'none',
  fontFamily: 'sans-serif',
  fontSize: 12,
  lineHeight: 1.2,
  color: 'rgb(0, 0, 0)',
  overflow: 'hidden',
  overflowWrap: 'break-word',
  whiteSpace: 'normal',
} satisfies CSSProperties

const renderTagCss = `
.canvas-render-tag-root {
  box-sizing: border-box;
  width: 100%;
  min-height: 100%;
  margin: 0;
  padding: 10px;
  font-family: sans-serif;
  font-size: 12px;
  line-height: 1.2;
  color: rgb(0, 0, 0);
  white-space: normal;
  overflow-wrap: break-word;
}

.canvas-render-tag-root *,
.canvas-render-tag-root *::before,
.canvas-render-tag-root *::after {
  box-sizing: border-box;
}

.canvas-render-tag-root code,
.canvas-render-tag-root pre,
.canvas-render-tag-root kbd,
.canvas-render-tag-root samp {
  font-size: inherit;
}

.canvas-render-tag-root li::marker {
  content: none;
  font-size: 0;
  line-height: 0;
}

.canvas-editor-paragraph {
  margin: 1em 0;
}

.canvas-editor-bold {
  font-weight: 700;
}

.canvas-editor-italic {
  font-style: italic;
}

.canvas-editor-underline {
  text-decoration-line: underline;
}
`

export function wrapRenderTagHtml(html: string) {
  return `<style>${renderTagCss}</style><div class="canvas-render-tag-root">${html}</div>`
}

export function exportRenderTagHtml(editor: LexicalEditor) {
  return wrapRenderTagHtml($generateHtmlFromNodes(editor, null))
}
