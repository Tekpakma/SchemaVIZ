import { useMemo } from 'react'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { ActiveCanvasNodeProvider, useActiveCanvasNodeId } from '../canvas/components/activeCanvasNodeContext'
import { useCanvasEditingNodeId, useCanvasNode } from '@/store/canvasStore'
import { LexicalCommitPlugin } from './LexicalCommitPlugin'
import { renderTagEditorStyle } from './exportRenderTagHtml'


export function LexicalOverlay() {
  const nodeId = useActiveCanvasNodeId()
  const node = useCanvasNode(nodeId)

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
      style={{
        position: 'absolute',
        boxSizing: 'border-box',
        left: node.x,
        top: node.y,
        width: node.width,
        height: node.height,
        zIndex: 10,
        background: 'white',
        outline: '2px solid #2563eb',
        borderRadius: 8,
        overflow: 'hidden',
        boxShadow: '0 6px 18px rgba(0, 0, 0, 0.12)',
      }}
    >
      <LexicalComposer initialConfig={initialConfig}>
        <RichTextPlugin
          contentEditable={
            <ContentEditable
              autoFocus
              style={renderTagEditorStyle}
            />
          }
          placeholder={null}
          ErrorBoundary={LexicalErrorBoundary}
        />

        <HistoryPlugin />

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
