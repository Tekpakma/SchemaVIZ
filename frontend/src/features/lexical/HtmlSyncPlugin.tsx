import { useEffect } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { layout } from 'render-tag'
import { exportRenderTagHtml } from './exportRenderTagHtml'
import { useActiveCanvasNodeId } from '../canvas/components/activeCanvasNodeContext';
import { useDebouncedCallback } from '@tanstack/react-pacer/debouncer'
import { useCanvasActions, useCanvasNodeWidth } from '@/store/canvasStore';

export function HtmlSyncPlugin() {
  const [editor] = useLexicalComposerContext()
  const nodeId = useActiveCanvasNodeId()

  const { commitNodeText } = useCanvasActions()
  const width = useCanvasNodeWidth(nodeId)

  const debouncedCommit = useDebouncedCallback(
    (payload: {
      lexicalJson: string
      html: string
      contentHeight: number
    }) => {
      commitNodeText({
        id: nodeId,
        lexicalJson: payload.lexicalJson,
        html: payload.html,
        contentHeight: payload.contentHeight,
      })
    },
    {
      wait: 80,
    },
  )

  useEffect(() => {
    if (!width) return
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const lexicalJson = JSON.stringify(editorState.toJSON())
        const html = exportRenderTagHtml(editor)

        const layoutResult = layout({
          html,
          width,
        })

        debouncedCommit({
          lexicalJson,
          html,
          contentHeight: Math.ceil(layoutResult.height),
        })
      })
    })
  }, [editor, width, debouncedCommit])

  return null
}