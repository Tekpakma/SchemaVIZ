import type { LexicalNode, TextNode } from 'lexical'
import { $createTextNode } from 'lexical'
import { $createDataReferenceNode } from './DataReferenceNode'
import type {
  DataReferenceInlineStyle,
  DataReferenceNode,
} from './DataReferenceNode'
import { parseInlineStyleString, styleObjectToString } from './styles'
import { TEMPLATE_PATTERN, TEMPLATE_PATTERN_GLOBAL } from './patterns'

/**
 * Finds the first `{{fieldName}}` pattern in `text`.
 *
 * Returns `[matchLength, fieldName]` so the caller knows how many characters
 * to consume from the source string, or `null` if no template is present.
 */
export function extractFieldName(text: string): [number, string] | null {
  const match = TEMPLATE_PATTERN.exec(text)
  if (!match) return null
  const fieldName = match.groups.fieldName.trim()
  return fieldName ? [match[0].length, fieldName] : null
}

/**
 * Reads formatting from a Lexical TextNode and returns it as a camelCase style
 * object suitable for a DataReferenceNode.
 *
 * Combines two sources: the node's inline CSS string (`getStyle()`) and its
 * binary format flags (`hasFormat('bold')` etc.), since Lexical stores them
 * separately.
 */
export function extractStylesFromTextNode(
  node: TextNode,
): DataReferenceInlineStyle {
  const styles = parseInlineStyleString(node.getStyle())
  if (node.hasFormat('bold')) styles.fontWeight = 'bold'
  if (node.hasFormat('italic')) styles.fontStyle = 'italic'
  if (node.hasFormat('underline')) styles.textDecoration = 'underline'
  return styles
}

/**
 * Converts a DataReferenceNode back into a standard Lexical TextNode.
 *
 * The reverse of `extractStylesFromTextNode`: bold/italic/underline are
 * mapped back to Lexical's binary format flags via `toggleFormat`, then
 * removed from the style object so they aren't duplicated as inline CSS.
 * Any remaining styles (e.g. color) are serialized into a CSS string.
 */
export function $dataReferenceToTextNode(node: DataReferenceNode): TextNode {
  const textNode = $createTextNode(node.getTextContent())
  const styles = { ...node.getStyles() }

  if (styles.fontWeight === 'bold' || styles.fontWeight === '700') {
    textNode.toggleFormat('bold')
  }
  delete styles.fontWeight

  if (styles.fontStyle === 'italic') {
    textNode.toggleFormat('italic')
  }
  delete styles.fontStyle

  if (styles.textDecoration?.includes('underline')) {
    textNode.toggleFormat('underline')
  }
  delete styles.textDecoration

  const remaining = styleObjectToString(styles)
  if (remaining) textNode.setStyle(remaining)

  return textNode
}

/**
 * Creates a new TextNode with the given `text` that inherits all visual
 * properties from `source` (format flags, detail, mode, inline style).
 *
 * Used when splitting a TextNode around `{{field}}` matches — the plain-text
 * fragments before/after each match must look identical to the original.
 */
function cloneTextSegment(source: TextNode, text: string): TextNode {
  const node = $createTextNode(text)
  node.setFormat(source.getFormat())
  node.setDetail(source.getDetail())
  node.setMode(source.getMode())
  node.setStyle(source.getStyle())
  return node
}
/**
 * Replaces template placeholders inside a TextNode with DataReferenceNodes.
 *
 * Matches placeholders of the form `{{fieldName}}`.
 * Plain text before, between, and after placeholders is preserved as cloned
 * TextNodes with the original text formatting, detail, mode, and inline style.
 *
 * Formatting from the original TextNode is bridged into each DataReferenceNode
 * so references visually inherit the surrounding text style.
 *
 * Returns `true` when the node was replaced with one or more new nodes,
 * otherwise `false` when no template placeholder was found.
 */
export function convertTextTemplatesToReferences(textNode: TextNode): boolean {
  const text = textNode.getTextContent()

  TEMPLATE_PATTERN_GLOBAL.lastIndex = 0

  let match = TEMPLATE_PATTERN_GLOBAL.exec(text)
  if (!match) return false

  const nextNodes: LexicalNode[] = []
  const styles = extractStylesFromTextNode(textNode)
  let lastIndex = 0

  while (match) {
    const before = text.slice(lastIndex, match.index)
    if (before) {
      nextNodes.push(cloneTextSegment(textNode, before))
    }

    const fieldName = match.groups.fieldName.trim()

    nextNodes.push(
      fieldName
        ? $createDataReferenceNode(fieldName, { ...styles })
        : cloneTextSegment(textNode, match[0]),
    )

    lastIndex = match.index + match[0].length
    match = TEMPLATE_PATTERN_GLOBAL.exec(text)
  }

  const after = text.slice(lastIndex)
  if (after) {
    nextNodes.push(cloneTextSegment(textNode, after))
  }

  const [first, ...rest] = nextNodes
  if (!first) return false

  textNode.replace(first)

  let cursor = first
  for (const node of rest) {
    cursor.insertAfter(node)
    cursor = node
  }

  return true
}
