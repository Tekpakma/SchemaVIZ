import { useEffect, useMemo } from 'react'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  ActiveCanvasNodeProvider,
  useActiveCanvasNodeId,
} from '../canvas/components/activeCanvasNodeContext'
import {
  useCanvasEditingNodeId,
  useCanvasNode,
  useCanvasViewport,
} from '@/store/canvasStore'
import { CANVAS_NODE_SURFACE_CSS_VALUE } from '@/features/canvas/themeColors'
import { LexicalCommitPlugin } from './LexicalCommitPlugin'
import { renderTagCss, renderTagEditorStyle } from './exportRenderTagHtml'
import { TEST_IDS } from '@/constants'


function LexicalAutoFocusPlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    editor.focus()
  }, [editor])

  return null
}

export function LexicalOverlay() {
  const nodeId = useActiveCanvasNodeId()
  const node = useCanvasNode(nodeId)
  const viewport = useCanvasViewport()

  const initialConfig = useMemo(
    () => ({
      namespace: `canvas-node-${nodeId}`,
      editorState: node?.lexicalJson || undefined,
      onError(error: Error) {
        throw error
      },
      theme: {
        paragraph: 'canvas-editor-paragraph',
        text: {
          bold: 'canvas-editor-bold',
          italic: 'canvas-editor-italic',
          underline: 'canvas-editor-underline',
        },
      },
      nodes: [],
    }),
    [nodeId, node?.lexicalJson],
  )

  if (!node) return null

  return (
    <div
      className="absolute top-0 left-0 z-10 box-border overflow-visible rounded-lg"
      data-testid={TEST_IDS.LEXICAL_OVERLAY}
      style={{
        background: CANVAS_NODE_SURFACE_CSS_VALUE,
        width: node.width,
        height: node.height,
        transform: `translate(${viewport.x + node.x * viewport.scale}px, ${viewport.y + node.y * viewport.scale}px) scale(${viewport.scale})`,
        transformOrigin: 'top left',
      }}
    >
      <style>{renderTagCss}</style>
      <LexicalComposer initialConfig={initialConfig}>
        <RichTextPlugin
          contentEditable={
            <ContentEditable
              autoFocus
              className="canvas-render-tag-root"
              style={renderTagEditorStyle}
            />
          }
          placeholder={null}
          ErrorBoundary={LexicalErrorBoundary}
        />

        <HistoryPlugin />
        <LexicalAutoFocusPlugin />
        <LexicalCommitPlugin />
      </LexicalComposer>
    </div>
  )
}

export function LexicalOverlayWrapper() {
  const editingNodeId = useCanvasEditingNodeId()
  if (!editingNodeId) return null
  return (
    <ActiveCanvasNodeProvider value={editingNodeId}>
      <LexicalOverlay />
    </ActiveCanvasNodeProvider>
  )
}
