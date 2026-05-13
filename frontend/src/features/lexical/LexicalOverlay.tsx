import { memo, Suspense, useEffect, useMemo } from 'react'
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
import { hasDataScope } from '@/features/canvas/model/types'
import type { NodeId } from '@/features/canvas/model/types'
import { CANVAS_NODE_SURFACE_CSS_VALUE } from '@/features/canvas/themeColors'
import { getCanvasNodeShapeDefinition } from '@/features/canvas/nodeShapes'
import { LexicalCommitPlugin } from './LexicalCommitPlugin'
import { LexicalOverlayRuntimeProvider } from './LexicalOverlayRuntimeContext'
import type { LexicalOverlayRuntime } from './LexicalOverlayRuntimeContext'
import { renderTagCss, renderTagEditorStyle } from './exportRenderTagHtml'
import { TEST_IDS } from '@/constants'
import { DataReferenceNode } from './dataReference/DataReferenceNode'
import { DataReferencePlugin } from './dataReference/DataReferencePlugin'
import { DataReferenceAutocomplete } from './dataReference/DataReferenceAutocomplete'

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
  const isGroup = runtime.node.kind === 'group'
  const editorHeight = isGroup
    ? Math.max(runtime.node.contentHeight, 40)
    : runtime.node.height

  return (
    <div
      className="absolute top-0 left-0 z-10 box-border overflow-visible"
      data-testid={TEST_IDS.LEXICAL_OVERLAY}
      style={{
        background: isGroup ? 'transparent' : CANVAS_NODE_SURFACE_CSS_VALUE,
        borderRadius: runtime.shapeDefinition.cornerRadius,
        width: runtime.node.width,
        height: editorHeight,
        transform: `translate(${viewport.x + runtime.node.x * viewport.scale}px, ${viewport.y + runtime.node.y * viewport.scale}px) scale(${viewport.scale})`,
        transformOrigin: 'top left',
      }}
    >
      <style>{renderTagCss}</style>
      <Suspense fallback={null}>
        <LexicalOverlayEditor runtime={runtime} />
      </Suspense>
    </div>
  )
}

const groupEditorStyle = {
  ...renderTagEditorStyle,
  justifyContent: 'flex-start' as const,
  textAlign: 'left' as const,
}

const LexicalOverlayEditor = memo(function LexicalOverlayEditor({
  runtime,
}: LexicalOverlayProps) {
  const isGroup = runtime.node.kind === 'group'
  const showDataReferences = runtime.dataScope !== undefined

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
      nodes: showDataReferences ? [DataReferenceNode] : [],
    }),
    [runtime.node.lexicalJson, runtime.nodeId, showDataReferences],
  )

  return (
    <LexicalOverlayRuntimeProvider value={runtime}>
      <LexicalComposer initialConfig={initialConfig}>
        <RichTextPlugin
          contentEditable={
            <ContentEditable
              autoFocus
              className="canvas-render-tag-root"
              style={isGroup ? groupEditorStyle : renderTagEditorStyle}
            />
          }
          placeholder={null}
          ErrorBoundary={LexicalErrorBoundary}
        />

        <HistoryPlugin />
        <LexicalAutoFocusPlugin />
        <LexicalCommitPlugin />
        {showDataReferences && <DataReferencePlugin />}
        {showDataReferences && <DataReferenceAutocomplete />}
      </LexicalComposer>
    </LexicalOverlayRuntimeProvider>
  )
})

function LexicalOverlayResolver({ nodeId }: LexicalOverlayResolverProps) {
  const node = useCanvasNode(nodeId)

  const runtime = useMemo<LexicalOverlayRuntime | null>(() => {
    if (!node) return null

    const base = {
      nodeId,
      node,
      shapeDefinition: getCanvasNodeShapeDefinition(node),
    }

    if (hasDataScope(node)) {
      return {
        ...base,
        dataScope: {
          appLabel: node.appLabel,
          modelName: node.modelName,
          recordId: 'recordId' in node ? node.recordId : undefined,
        },
      }
    }

    return base
  }, [node, nodeId])

  if (!runtime) return null

  return <LexicalOverlay runtime={runtime} />
}

export function LexicalOverlayWrapper() {
  const editingNodeId = useCanvasEditingNodeId()
  if (!editingNodeId) return null
  return <LexicalOverlayResolver nodeId={editingNodeId} />
}
