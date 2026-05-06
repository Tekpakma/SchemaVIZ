import { useCallback, useEffect, useRef } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { layout } from 'render-tag'
import {
  BLUR_COMMAND,
  COMMAND_PRIORITY_EDITOR,
  COMMAND_PRIORITY_HIGH,
  INSERT_LINE_BREAK_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
} from 'lexical'
import { mergeRegister } from '@lexical/utils'

import { useActiveCanvasNodeId } from '../canvas/components/activeCanvasNodeContext'
import { useCanvasActions, useCanvasNodeWidth } from '@/store/canvasStore'
import { exportRenderTagHtml, renderTagAccuracy } from './exportRenderTagHtml'

export function LexicalCommitPlugin() {
  const [editor] = useLexicalComposerContext()
  const nodeId = useActiveCanvasNodeId()
  const { commitNodeText, stopEditing } = useCanvasActions()
  const nodeWidth = useCanvasNodeWidth(nodeId)
  const didCommitRef = useRef(false)

  useEffect(() => {
    didCommitRef.current = false
  }, [editor, nodeId])

  const commit = useCallback(() => {
    if (didCommitRef.current || !nodeWidth) return true

    didCommitRef.current = true

    const editorState = editor.getEditorState()
    let lexicalJson = ''
    let html = ''
    let contentHeight = 0

    editorState.read(() => {
      lexicalJson = JSON.stringify(editorState.toJSON())
      html = exportRenderTagHtml(editor)

      const layoutResult = layout({
        html,
        width: nodeWidth,
        accuracy: renderTagAccuracy,
      })

      contentHeight = Math.ceil(layoutResult.height)
    })

    commitNodeText({
      id: nodeId,
      lexicalJson,
      html,
      contentHeight,
    })
    stopEditing()

    return true
  }, [editor, nodeId, nodeWidth, commitNodeText, stopEditing])

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        BLUR_COMMAND,
        () => {
          return commit()
        },
        COMMAND_PRIORITY_EDITOR,
      ),
      editor.registerCommand(
        KEY_ESCAPE_COMMAND,
        (event) => {
          event.preventDefault()
          return commit()
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        (event) => {
          if (!event) return false

          if (event.metaKey || event.ctrlKey) {
            event.preventDefault()
            return commit()
          }

          event.preventDefault()
          return editor.dispatchCommand(INSERT_LINE_BREAK_COMMAND, false)
        },
        COMMAND_PRIORITY_HIGH,
      ),
    )
  }, [editor, commit])

  return null
}
