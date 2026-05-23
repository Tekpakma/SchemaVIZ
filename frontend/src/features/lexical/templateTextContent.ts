import { escapeHtml } from '@/utils/html'
import { renderTagCss, wrapRenderTagHtml } from './exportRenderTagHtml'
import { styleObjectToString } from './dataReference/styles'

type SerializedNode = {
  children?: SerializedNode[]
  format?: number | string
  path?: string
  style?: string
  styles?: Record<string, string>
  text?: string
  type?: string
}

const DEFAULT_TEXT_CONTENT = {
  root: {
    children: [
      {
        children: [
          {
            detail: 0,
            format: 0,
            mode: 'normal',
            style: '',
            text: 'Node',
            type: 'text',
            version: 1,
          },
        ],
        direction: null,
        format: '',
        indent: 0,
        type: 'paragraph',
        version: 1,
        textFormat: 0,
        textStyle: '',
      },
    ],
    direction: null,
    format: '',
    indent: 0,
    type: 'root',
    version: 1,
  },
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function readRootNode(textContent: unknown): SerializedNode | null {
  if (typeof textContent === 'string') {
    try {
      return readRootNode(JSON.parse(textContent))
    } catch {
      return null
    }
  }

  if (!isRecord(textContent)) return null
  const root = textContent.root
  return isRecord(root) ? root : textContent
}

function sanitizeStyleAttribute(style: string | undefined) {
  if (!style) return ''
  return style.replace(/["<>]/g, '')
}

const TEMPLATE_TEXT_PATTERN = /\{\{\s*([^{}]+?)\s*\}\}/g

function renderTemplateText(
  text: string,
  recordFields: Record<string, unknown> | undefined,
) {
  let result = ''
  let lastIndex = 0

  TEMPLATE_TEXT_PATTERN.lastIndex = 0
  let match = TEMPLATE_TEXT_PATTERN.exec(text)

  while (match) {
    const rawPath = match[1]?.trim() ?? ''
    result += escapeHtml(text.slice(lastIndex, match.index))
    result += rawPath
      ? renderDataReferenceTextHtml(rawPath, recordFields)
      : escapeHtml(match[0])
    lastIndex = match.index + match[0].length
    match = TEMPLATE_TEXT_PATTERN.exec(text)
  }

  result += escapeHtml(text.slice(lastIndex))
  TEMPLATE_TEXT_PATTERN.lastIndex = 0
  return result
}

function renderTextNode(
  node: SerializedNode,
  recordFields: Record<string, unknown> | undefined,
) {
  const text = renderTemplateText(node.text ?? '', recordFields)
  const style = sanitizeStyleAttribute(node.style)
  return style ? `<span style="${style}">${text}</span>` : text
}

const COLLECTION_MAX_ITEMS = 5
const COLLECTION_SEPARATOR = ', '
const UNRESOLVED = Symbol('unresolved')
type FieldDisplayState = 'resolved' | 'empty' | 'missing' | 'literal'
type FieldDisplayValue = {
  state: FieldDisplayState
  text: string
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function readScalar(record: Record<string, unknown>, segment: string): unknown {
  if (segment in record) return record[segment]
  const fk = `${segment}_id`
  if (fk in record) return record[fk]
  return UNRESOLVED
}

/**
 * Walks a dotted path through ``recordFields``. The backend resolver shapes
 * relations as nested dicts (forward FK / O2O) or arrays of dicts (reverse FK
 * / M2M); this walker mirrors that shape:
 *
 *  - object node → recurse into the next segment's key
 *  - array node  → recurse into each element with the remaining segments,
 *                  collect into a flat array of resolved scalars
 *  - scalar leaf → returned as-is
 *
 * Returns ``UNRESOLVED`` (not ``undefined``) when a segment is missing — the
 * caller uses that sentinel to render the literal ``{{path}}`` marker so the
 * author can see something needs fixing.
 */
function walkPath(segments: string[], data: unknown): unknown {
  if (segments.length === 0) return data
  if (data == null) return UNRESOLVED

  if (Array.isArray(data)) {
    const results: unknown[] = []
    for (const item of data) {
      const resolved = walkPath(segments, item)
      if (resolved === UNRESOLVED) continue
      if (Array.isArray(resolved)) {
        results.push(...resolved)
      } else {
        results.push(resolved)
      }
    }
    return results
  }

  if (!isPlainRecord(data)) return UNRESOLVED

  const [head, ...rest] = segments
  if (head === undefined) return data
  const next = readScalar(data, head)
  if (next === UNRESOLVED) return UNRESOLVED
  return walkPath(rest, next)
}

function formatScalar(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function formatCollection(values: unknown[]): string {
  const scalars = values.filter((v) => v != null).map(formatScalar)
  if (scalars.length === 0) return ''
  if (scalars.length <= COLLECTION_MAX_ITEMS) {
    return scalars.join(COLLECTION_SEPARATOR)
  }
  const shown = scalars
    .slice(0, COLLECTION_MAX_ITEMS)
    .join(COLLECTION_SEPARATOR)
  return `${shown} (+${scalars.length - COLLECTION_MAX_ITEMS} more)`
}

function humanizePathSubject(path: string) {
  const [firstSegment] = path.split('.').filter(Boolean)
  return (firstSegment || path)
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
    .toLowerCase()
}

function getFieldDisplayValue(
  path: string,
  recordFields: Record<string, unknown> | undefined,
): FieldDisplayValue {
  if (!recordFields) return { state: 'literal', text: `{{${path}}}` }
  const segments = path.split('.').filter(Boolean)
  if (segments.length === 0) return { state: 'literal', text: `{{${path}}}` }

  const value = walkPath(segments, recordFields)
  if (value === UNRESOLVED || value == null) {
    return { state: 'missing', text: `Missing: ${path}` }
  }
  if (Array.isArray(value)) {
    const formatted = formatCollection(value)
    return formatted
      ? { state: 'resolved', text: formatted }
      : { state: 'empty', text: `No ${humanizePathSubject(path)}` }
  }
  return { state: 'resolved', text: formatScalar(value) }
}

function getPlaceholderAttributes(state: FieldDisplayState) {
  if (state !== 'empty' && state !== 'missing') return ''
  return ` class="canvas-data-reference-placeholder" data-reference-state="${state}"`
}

function renderDataReferenceTextHtml(
  path: string,
  recordFields: Record<string, unknown> | undefined,
) {
  const display = getFieldDisplayValue(path, recordFields)
  return `<span data-lexical-data-reference="${escapeHtml(path)}"${getPlaceholderAttributes(
    display.state,
  )}>${escapeHtml(display.text)}</span>`
}

function renderDataReferenceNode(
  node: SerializedNode,
  recordFields: Record<string, unknown> | undefined,
) {
  const path = node.path?.trim()
  if (!path) return ''

  const style = sanitizeStyleAttribute(
    node.styles ? styleObjectToString(node.styles) : undefined,
  )
  const display = getFieldDisplayValue(path, recordFields)
  const content = escapeHtml(display.text)

  return `<span data-lexical-data-reference="${escapeHtml(path)}"${getPlaceholderAttributes(
    display.state,
  )}${style ? ` style="${style}"` : ''}>${content}</span>`
}

function renderChildren(
  node: SerializedNode,
  recordFields: Record<string, unknown> | undefined,
) {
  return (node.children ?? [])
    .map((child) => renderTemplateNode(child, recordFields))
    .join('')
}

function renderTemplateNode(
  node: SerializedNode,
  recordFields: Record<string, unknown> | undefined,
): string {
  if (node.type === 'text') return renderTextNode(node, recordFields)
  if (node.type === 'data-reference') {
    return renderDataReferenceNode(node, recordFields)
  }
  if (node.type === 'linebreak') return '<br />'
  if (node.type === 'paragraph') {
    return `<p class="canvas-editor-paragraph">${renderChildren(
      node,
      recordFields,
    )}</p>`
  }
  return renderChildren(node, recordFields)
}

export function createTemplateTextContent(label: string) {
  // Structurally clone only the parts that differ — the text node's
  // `text` field. The old JSON.parse(JSON.stringify(...)) deep clone
  // is ~0.1 ms per call; at 152 nodes that's 15 ms of pure waste on
  // every recipe edit. This version allocates the same shape but
  // shares nothing mutable with DEFAULT_TEXT_CONTENT.
  const textNode = {
    ...DEFAULT_TEXT_CONTENT.root.children[0]!.children[0]!,
    text: label || 'Node',
  }
  const paragraph = {
    ...DEFAULT_TEXT_CONTENT.root.children[0]!,
    children: [textNode],
  }
  return {
    root: {
      ...DEFAULT_TEXT_CONTENT.root,
      children: [paragraph],
    },
  }
}

export function stringifyTemplateTextContent(textContent: unknown) {
  if (typeof textContent === 'string') return textContent
  return JSON.stringify(textContent ?? DEFAULT_TEXT_CONTENT)
}

export function renderTemplateTextContent(
  textContent: unknown,
  recordFields?: Record<string, unknown>,
) {
  // NOTE: We previously spun up a headless Lexical editor here, but the
  // result was discarded — the actual HTML is produced by the tolerant
  // walker (`renderChildren`) directly off the serialized JSON. Spinning
  // up a Lexical editor instance per node is ~1 ms; at 5000 nodes that's
  // 5 seconds of pure waste on every recipe edit. The walker is also
  // more permissive — it gracefully renders older or partial payloads
  // that Lexical's parser would reject.
  const root = readRootNode(textContent ?? DEFAULT_TEXT_CONTENT)
  if (!root) return wrapRenderTagHtml('')
  return `<style>${renderTagCss}</style><div class="canvas-render-tag-root">${renderChildren(
    root,
    recordFields,
  )}</div>`
}
