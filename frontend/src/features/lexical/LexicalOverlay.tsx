import { memo, useEffect, useMemo } from 'react'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  useCanvasEditingNodeId,
  useCanvasNode,
  useCanvasViewport,
} from '@/store/canvasStore'
import type { NodeId } from '@/features/canvas/model/types'
import { CANVAS_NODE_SURFACE_CSS_VALUE } from '@/features/canvas/themeColors'
import { getCanvasNodeShapeDefinition } from '@/features/canvas/nodeShapes'
import { LexicalCommitPlugin } from './LexicalCommitPlugin'
import { LexicalOverlayRuntimeProvider } from './LexicalOverlayRuntimeContext'
import type { LexicalOverlayRuntime } from './LexicalOverlayRuntimeContext'
import { renderTagCss, renderTagEditorStyle } from './exportRenderTagHtml'
import { TEST_IDS } from '@/constants'

function LexicalAutoFocusPlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    editor.focus()
  }, [editor])

  return null
}

type LexicalOverlayProps = {
  runtime: LexicalOverlayRuntime
}

type LexicalOverlayResolverProps = {
  nodeId: NodeId
}

export function LexicalOverlay({ runtime }: LexicalOverlayProps) {
  const viewport = useCanvasViewport()

  return (
    <div
      className="absolute top-0 left-0 z-10 box-border overflow-visible"
      data-testid={TEST_IDS.LEXICAL_OVERLAY}
      style={{
        background: CANVAS_NODE_SURFACE_CSS_VALUE,
        borderRadius: runtime.shapeDefinition.cornerRadius,
        width: runtime.node.width,
        height: runtime.node.height,
        transform: `translate(${viewport.x + runtime.node.x * viewport.scale}px, ${viewport.y + runtime.node.y * viewport.scale}px) scale(${viewport.scale})`,
        transformOrigin: 'top left',
      }}
    >
      <style>{renderTagCss}</style>
      <LexicalOverlayEditor runtime={runtime} />
    </div>
  )
}

const LexicalOverlayEditor = memo(function LexicalOverlayEditor({
  runtime,
}: LexicalOverlayProps) {
  const initialConfig = useMemo(
    () => ({
      namespace: `canvas-node-${runtime.nodeId}`,
      editorState: runtime.node.lexicalJson || undefined,
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
    [runtime.node.lexicalJson, runtime.nodeId],
  )

  return (
    <LexicalOverlayRuntimeProvider value={runtime}>
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
    </LexicalOverlayRuntimeProvider>
  )
})

function LexicalOverlayResolver({ nodeId }: LexicalOverlayResolverProps) {
  const node = useCanvasNode(nodeId)

  const runtime = useMemo<LexicalOverlayRuntime | null>(() => {
    if (!node || node.shape !== 'box') {
      return null
    }

    return {
      nodeId,
      node,
      shapeDefinition: getCanvasNodeShapeDefinition(node),
      dataScope: {
        appLabel: node.appLabel,
        modelName: node.modelName,
        recordId: node.recordId,
      },
    }
  }, [node, nodeId])

  if (!runtime) return null

  return <LexicalOverlay runtime={runtime} />
}

export function LexicalOverlayWrapper() {
  const editingNodeId = useCanvasEditingNodeId()
  if (!editingNodeId) return null
  return <LexicalOverlayResolver nodeId={editingNodeId} />
}
