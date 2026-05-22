import type { LexicalEditor } from 'lexical'
import { $generateHtmlFromNodes } from '@lexical/html'
import type { CSSProperties } from 'react'

export const renderTagAccuracy = 'balanced'

export const renderTagEditorStyle = {
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  width: '100%',
  height: '100%',
  minHeight: '100%',
  margin: 0,
  padding: 10,
  outline: 'none',
  fontFamily: 'sans-serif',
  fontSize: 12,
  lineHeight: 1.2,
  color: 'var(--foreground, rgb(0, 0, 0))',
  caretColor: 'var(--foreground, rgb(0, 0, 0))',
  cursor: 'text',
  textAlign: 'center',
  overflow: 'visible',
  overflowWrap: 'break-word',
  whiteSpace: 'normal',
} satisfies CSSProperties

export const renderTagCss = `
.canvas-render-tag-root {
  box-sizing: border-box;
  width: 100%;
  margin: 0;
  padding: 10px;
  font-family: sans-serif;
  font-size: 12px;
  line-height: 1.2;
  color: rgb(0, 0, 0);
  text-align: center;
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
  margin: 0;
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

.canvas-data-reference-placeholder {
  color: #71717a;
  font-style: italic;
  text-decoration-line: underline;
  text-decoration-style: dotted;
  text-underline-offset: 2px;
}

.canvas-data-reference-placeholder[data-reference-state='missing'] {
  color: #92400e;
}
`

export function wrapRenderTagHtml(html: string) {
  return `<style>${renderTagCss}</style><div class="canvas-render-tag-root">${html}</div>`
}

/**
 * Replaces `data-lexical-data-reference` spans in exported HTML with resolved
 * field values from the record. Flat fields are resolved synchronously here;
 * dotted paths (relations) are left as `{{path}}` templates for async
 * resolution via {@link resolveDeepPathSpans}.
 */
function resolveDataReferenceSpans(
  html: string,
  recordFields: Record<string, unknown>,
): string {
  return html.replace(
    /<span data-lexical-data-reference="([^"]+)">(?:\{\{[^}]*\}\}|[^<]*)<\/span>/g,
    (_match, path: string) => {
      // Deep paths need async traversal — resolved in a second pass
      if (path.includes('.')) {
        return `<span data-lexical-data-reference="${path}">{{${path}}}</span>`
      }

      const value = recordFields[path] ?? recordFields[`${path}_id`]
      if (value == null) {
        return `<span data-lexical-data-reference="${path}">{{${path}}}</span>`
      }

      const display =
        typeof value === 'object' ? JSON.stringify(value) : String(value)
      return `<span data-lexical-data-reference="${path}">${display}</span>`
    },
  )
}

export function exportRenderTagHtml(
  editor: LexicalEditor,
  recordFields?: Record<string, unknown>,
) {
  let html = $generateHtmlFromNodes(editor, null)
  if (recordFields) {
    html = resolveDataReferenceSpans(html, recordFields)
  }
  return wrapRenderTagHtml(html)
}

// ---------------------------------------------------------------------------
// Deep-path resolution helpers (async, used at commit time)
// ---------------------------------------------------------------------------

const UNRESOLVED_DEEP_PATH_PATTERN =
  /<span data-lexical-data-reference="([^"]+)">\{\{[^}]*\}\}<\/span>/g

/**
 * Extracts deduplicated dotted-path field names from data-reference spans that
 * still contain unresolved `{{…}}` templates.
 */
export function extractUnresolvedDeepPaths(html: string): string[] {
  const paths = new Set<string>()

  for (const [, path] of html.matchAll(UNRESOLVED_DEEP_PATH_PATTERN)) {
    if (path?.includes('.')) paths.add(path)
  }

  return [...paths]
}

/**
 * Replaces unresolved deep-path template spans with pre-resolved display
 * values. Pure string transform — async resolution happens upstream.
 */
export function resolveDeepPathSpans(
  html: string,
  resolvedPaths: ReadonlyMap<string, string>,
): string {
  if (resolvedPaths.size === 0) return html

  return html.replace(UNRESOLVED_DEEP_PATH_PATTERN, (match, path: string) => {
    const display = resolvedPaths.get(path)
    if (display == null) return match
    return `<span data-lexical-data-reference="${path}">${display}</span>`
  })
}
