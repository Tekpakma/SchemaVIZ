import { useEffect } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { mergeRegister } from '@lexical/utils'
import type { TextFormatType } from 'lexical'
import {
  $getSelection,
  $isNodeSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_EDITOR,
  COMMAND_PRIORITY_LOW,
  FORMAT_TEXT_COMMAND,
  TextNode,
} from 'lexical'
import {
  APPLY_INLINE_TEXT_STYLE_COMMAND,
  INSERT_DATA_REFERENCE_COMMAND,
} from './commands'
import { convertTextTemplatesToReferences } from './conversion'
import {
  $createDataReferenceNode,
  $isDataReferenceNode,
} from './DataReferenceNode'
import { extractSelectionStyles } from './styles'
import { TEMPLATE_PATTERN_GLOBAL } from './patterns'

/**
 * Cursor-aware transform: when the cursor sits directly after a completed
 * `{{fieldName}}` pattern, replace just that match with a DataReferenceNode.
 *
 * This fires during normal typing (e.g. via the autocomplete menu) and avoids
 * the full-scan approach of `convertTextTemplatesToReferences` which would also
 * match templates the user is still composing.
 *
 * Returns `true` when a replacement was made.
 */
function tryCursorAwareConversion(textNode: TextNode): boolean {
  const selection = $getSelection()
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return false
  }

  const node = selection.getNodes()[0]
  if (node !== textNode) return false

  const textContent = textNode.getTextContent()
  const cursorPosition = selection.anchor.offset

  TEMPLATE_PATTERN_GLOBAL.lastIndex = 0
  try {
    let match = TEMPLATE_PATTERN_GLOBAL.exec(textContent)

    while (match) {
      const fieldName = match.groups.fieldName.trim()

      if (!fieldName) {
        match = TEMPLATE_PATTERN_GLOBAL.exec(textContent)
        continue
      }

      const matchStart = match.index
      const matchEnd = matchStart + match[0].length

      if (cursorPosition === matchEnd && !fieldName.endsWith('.')) {
        const styles = extractSelectionStyles(selection)
        const textBefore = textContent.slice(0, matchStart)
        const textAfter = textContent.slice(matchEnd)

        textNode.setTextContent(textBefore + textAfter)
        textNode
          .select(matchStart, matchStart)
          .insertNodes([$createDataReferenceNode(fieldName, styles)])
        return true
      }

      match = TEMPLATE_PATTERN_GLOBAL.exec(textContent)
    }
  } finally {
    TEMPLATE_PATTERN_GLOBAL.lastIndex = 0
  }

  return false
}

/**
 * Registers all DataReference node transforms and commands on the editor.
 *
 * - TextNode transform: converts `{{field}}` patterns to DataReferenceNodes
 *   (cursor-aware single-match for typing, bulk for paste/load).
 * - INSERT_DATA_REFERENCE_COMMAND: inserts a new chip at the selection.
 * - FORMAT_TEXT_COMMAND: forwards bold/italic/underline to selected chips.
 * - APPLY_INLINE_TEXT_STYLE_COMMAND: patches arbitrary CSS on selected chips.
 */
export function DataReferencePlugin(): null {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    return mergeRegister(
      editor.registerNodeTransform(TextNode, (textNode) => {
        if (tryCursorAwareConversion(textNode)) return
        convertTextTemplatesToReferences(textNode)
      }),

      editor.registerCommand(
        INSERT_DATA_REFERENCE_COMMAND,
        (fieldName: string) => {
          const selection = $getSelection()
          if (!$isRangeSelection(selection)) return false

          const styles = extractSelectionStyles(selection)
          selection.insertNodes([$createDataReferenceNode(fieldName, styles)])
          return true
        },
        COMMAND_PRIORITY_EDITOR,
      ),

      editor.registerCommand(
        FORMAT_TEXT_COMMAND,
        (format: TextFormatType) => {
          const selection = $getSelection()
          if (
            !$isRangeSelection(selection) &&
            !$isNodeSelection(selection)
          ) {
            return false
          }

          for (const node of selection.getNodes()) {
            if ($isDataReferenceNode(node)) {
              node.toggleTextFormat(format)
            }
          }

          return false
        },
        COMMAND_PRIORITY_LOW,
      ),

      editor.registerCommand(
        APPLY_INLINE_TEXT_STYLE_COMMAND,
        (styles: Record<string, string>) => {
          const selection = $getSelection()
          if (
            !$isRangeSelection(selection) &&
            !$isNodeSelection(selection)
          ) {
            return false
          }

          let hasDataReferenceNodes = false
          for (const node of selection.getNodes()) {
            if ($isDataReferenceNode(node)) {
              node.patchStyles(styles)
              hasDataReferenceNodes = true
            }
          }

          return hasDataReferenceNodes
        },
        COMMAND_PRIORITY_EDITOR,
      ),
    )
  }, [editor])

  return null
}
