import { useMemo } from 'react'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { ActiveCanvasNodeProvider, useActiveCanvasNodeId } from '../canvas/components/activeCanvasNodeContext'
import { useCanvasEditingNodeId, useCanvasNode, useCanvasViewport } from '@/store/canvasStore'
import { LexicalCommitPlugin } from './LexicalCommitPlugin'
import { renderTagCss, renderTagEditorStyle } from './exportRenderTagHtml'


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
      style={{
        position: 'absolute',
        boxSizing: 'border-box',
        left: 0,
        top: 0,
        width: node.width,
        height: node.height,
        transform: `translate(${viewport.x + node.x * viewport.scale}px, ${viewport.y + node.y * viewport.scale}px) scale(${viewport.scale})`,
        transformOrigin: 'top left',
        zIndex: 10,
        background: 'white',
        outline: '2px solid #2563eb',
        borderRadius: 8,
        overflow: 'hidden',
        boxShadow: '0 6px 18px rgba(0, 0, 0, 0.12)',
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
