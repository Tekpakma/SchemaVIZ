import { escapeHtml } from '@/utils/html'
import {
  renderTagCss,
  wrapRenderTagHtml,
} from './exportRenderTagHtml'

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

function renderTextNode(node: SerializedNode) {
  const text = escapeHtml(node.text ?? '')
  const style = sanitizeStyleAttribute(node.style)
  return style ? `<span style="${style}">${text}</span>` : text
}

function getFieldDisplayValue(
  path: string,
  recordFields: Record<string, unknown> | undefined,
) {
  if (!recordFields || path.includes('.')) return `{{${path}}}`

  const value = recordFields[path] ?? recordFields[`${path}_id`]
  if (value == null) return `{{${path}}}`
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function renderDataReferenceNode(
  node: SerializedNode,
  recordFields: Record<string, unknown> | undefined,
) {
  const path = node.path?.trim()
  if (!path) return ''

  const style = sanitizeStyleAttribute(
    node.styles
      ? Object.entries(node.styles)
          .map(([key, value]) => `${key}: ${value}`)
          .join('; ')
      : undefined,
  )
  const content = escapeHtml(getFieldDisplayValue(path, recordFields))

  return `<span data-lexical-data-reference="${escapeHtml(path)}"${
    style ? ` style="${style}"` : ''
  }>${content}</span>`
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
  if (node.type === 'text') return renderTextNode(node)
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
  const next = JSON.parse(JSON.stringify(DEFAULT_TEXT_CONTENT)) as typeof DEFAULT_TEXT_CONTENT
  next.root.children[0]!.children[0]!.text = label || 'Node'
  return next
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
