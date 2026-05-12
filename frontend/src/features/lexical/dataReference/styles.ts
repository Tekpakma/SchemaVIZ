import type { RangeSelection } from 'lexical'
import { $getSelectionStyleValueForProperty } from '@lexical/selection'
import * as R from 'remeda'

// ---------------------------------------------------------------------------
// CSS ↔ JS key conversion
// ---------------------------------------------------------------------------

/**
 * Converts a CSS kebab-case property name (e.g., 'font-weight') to its
 * React camelCase equivalent (e.g., 'fontWeight'). Custom properties (e.g., '--color') are preserved.
 */
export function cssToCamelCase(key: string): string {
  if (key.startsWith('--')) return key
  return R.toCamelCase(key)
}

/**
 * Converts a React camelCase property name (e.g., 'fontWeight') back to its
 * standard CSS kebab-case equivalent (e.g., 'font-weight').
 */
export function camelToCssCase(key: string): string {
  if (key.startsWith('--')) return key
  return R.toKebabCase(key)
}

// ---------------------------------------------------------------------------
// Style object ↔ CSS string serialization
// ---------------------------------------------------------------------------

/**
 * Parses a standard CSS inline style string into a React-compatible style object.
 * Example: "font-weight: bold; color: red" -> { fontWeight: 'bold', color: 'red' }
 *
 * When reading formatting off a Lexical `TextNode`, `node.getStyle()` returns
 * a raw CSS string. This utility extracts that formatting so we can store it
 * cleanly on our custom `DataReferenceNode`.
 */
export function parseInlineStyleString(
  styleString: string,
): Record<string, string> {
  return R.pipe(
    styleString.split(';'),
    R.map((entry) => entry.trim()),
    R.filter(R.isTruthy),
    R.map((entry) => {
      const [rawKey, ...rawValueParts] = entry.split(':')
      return [
        cssToCamelCase(rawKey?.trim() ?? ''),
        rawValueParts.join(':').trim(),
      ] as const
    }),
    R.filter(([key, value]) => Boolean(key && value)),
    R.fromEntries(),
  )
}

/**
 * Serializes a React-compatible style object back into a CSS inline style string.
 * Example: { fontWeight: 'bold' } -> "font-weight: bold"
 *
 * When converting our custom `DataReferenceNode` back into a standard Lexical
 * `TextNode`, we must provide its formatting as a single valid CSS string via
 * `textNode.setStyle()`.
 */
export function styleObjectToString(styles: Record<string, string>): string {
  return R.pipe(
    styles,
    R.entries(),
    R.map(([key, value]) => `${camelToCssCase(key)}: ${value}`),
    R.join('; '),
  )
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/**
 * Normalizes all keys in a style object to camelCase.
 *
 * Called at DataReferenceNode boundaries (constructor, patchStyles) to enforce
 * the invariant that internal style keys are always camelCase — regardless of
 * whether the caller passed CSS kebab-case or React camelCase keys.
 */
export function normalizeStyleObject(
  styles: Record<string, string>,
): Record<string, string> {
  return R.pipe(
    styles,
    R.entries(),
    R.map(([key, value]) => [cssToCamelCase(key), value] as const),
    R.fromEntries(),
  )
}

// ---------------------------------------------------------------------------
// Lexical selection → style extraction
// ---------------------------------------------------------------------------

/**
 * Extracts the active text formatting (bold, italic, color, etc.) from the
 * user's current cursor selection.
 *
 * Standard Lexical `TextNode`s automatically inherit cursor formatting.
 * Our custom `DecoratorNode` (DataReferenceNode) does not — so we call this
 * right before insertion to carry the surrounding style into the chip.
 */
export function extractSelectionStyles(
  selection: RangeSelection,
): Record<string, string> {
  const styles: Record<string, string> = {}
  if (selection.hasFormat('bold')) styles.fontWeight = 'bold'
  if (selection.hasFormat('italic')) styles.fontStyle = 'italic'
  if (selection.hasFormat('underline')) styles.textDecoration = 'underline'
  const color = $getSelectionStyleValueForProperty(selection, 'color', '')
  if (color) styles.color = color
  return styles
}
