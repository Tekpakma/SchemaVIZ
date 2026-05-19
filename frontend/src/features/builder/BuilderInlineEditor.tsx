/**
 * BuilderInlineEditor — persistent Lexical editor for the builder canvas.
 *
 * Design (per Lexical's React FAQ): mount LexicalComposer ONCE for the
 * lifetime of <BuilderPreview>. Toggle between view and edit mode via
 * `editor.setEditable()`, swap node content via `editor.setEditorState()`,
 * and move the contenteditable around via CSS transform.
 *
 * Why the previous design failed
 * ------------------------------
 * The old `<LexicalOverlayWrapper>` conditionally mounted a new
 * LexicalComposer for every `editingNodeId`. Every edit session paid the
 * React StrictMode tax (mount → throwaway-unmount → remount in dev),
 * which fired transient `blur` events. Those blurs triggered our
 * `commitAndExit` → `stopEditing` chain, which cleared `editingNodeId`,
 * which unmounted the overlay before the user could type. We patched
 * with a 100 ms blur settle window, but per-session remount made the
 * race re-occur on every subsequent edit.
 *
 * Lexical FAQ:
 *   "LexicalComposer's `initialConfig` is only considered once during
 *    the first render."
 *
 * → Mount it once and reuse the editor instance.
 */

import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react'
import {
  $getRoot,
  BLUR_COMMAND,
  COMMAND_PRIORITY_EDITOR,
  COMMAND_PRIORITY_HIGH,
  FOCUS_COMMAND,
  INSERT_LINE_BREAK_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
} from 'lexical'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { mergeRegister } from '@lexical/utils'
import { layout } from 'render-tag'

import {
  useCanvasActions,
  useCanvasEditingNodeId,
  useCanvasNodes,
  useCanvasViewport,
} from '@/store/canvasStore'
import {
  CANVAS_NODE_BORDER_FALLBACKS,
  CANVAS_NODE_SURFACE_CSS_VALUE,
} from '@/features/canvas/themeColors'
import { getCanvasNodeShapeDefinition } from '@/features/canvas/nodeShapes'
import { useTheme } from '@/features/theme/useTheme'
import {
  exportRenderTagHtml,
  renderTagAccuracy,
  renderTagCss,
  renderTagEditorStyle,
} from '@/features/lexical/exportRenderTagHtml'
import { DataReferenceNode } from '@/features/lexical/dataReference/DataReferenceNode'
import { DataReferencePlugin } from '@/features/lexical/dataReference/DataReferencePlugin'
import { DataReferenceAutocomplete } from '@/features/lexical/dataReference/DataReferenceAutocomplete'
import { LexicalOverlayRuntimeProvider } from '@/features/lexical/LexicalOverlayRuntimeContext'
import type { LexicalOverlayRuntime } from '@/features/lexical/LexicalOverlayRuntimeContext'
import { hasDataScope } from '@/features/canvas/model/types'
import { TEST_IDS } from '@/constants'

// Time window during which a transient BLUR (e.g. StrictMode-induced)
// can be cancelled by a follow-up FOCUS before it commits.
const BLUR_COMMIT_SETTLE_MS = 100

const INITIAL_CONFIG = {
  namespace: 'builder-inline-editor',
  // Start in non-editable mode — we toggle on/off via setEditable based
  // on editingNodeId. The editor itself stays mounted forever.
  editable: false,
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
  // DataReferenceNode is always registered. The autocomplete plugin
  // that *uses* it is gated separately on whether the node has a
  // dataScope (which BuilderPreview nodes don't, currently).
  nodes: [DataReferenceNode],
}

export type BuilderInlineEditorCommit = {
  nodeId: string
  lexicalJson: string
  html: string
  contentHeight: number
}

export type BuilderInlineEditorProps = {
  /**
   * Direct commit pipe to the recipe — called when the user finishes
   * editing (blur / esc / cmd-enter). Avoids the canvas-store →
   * CommitBridge → BuilderPage chain so the recipe is updated reliably
   * even if the canvas store is later torn down (e.g. on preview toggle).
   */
  onCommit?: (commit: BuilderInlineEditorCommit) => void
}

export function BuilderInlineEditor({ onCommit }: BuilderInlineEditorProps) {
  return (
    <LexicalComposer initialConfig={INITIAL_CONFIG}>
      <BuilderInlineEditorBody onCommit={onCommit} />
    </LexicalComposer>
  )
}

function BuilderInlineEditorBody({ onCommit }: BuilderInlineEditorProps) {
  const [editor] = useLexicalComposerContext()
  const editingNodeId = useCanvasEditingNodeId()
  const nodes = useCanvasNodes()
  const viewport = useCanvasViewport()
  const { commitNodeText, stopEditing } = useCanvasActions()
  const { resolvedTheme } = useTheme()
  const onCommitRef = useRef(onCommit)
  onCommitRef.current = onCommit

  const node = editingNodeId ? nodes[editingNodeId] : null
  const isEditing = !!node

  // Build a per-edit-session runtime for plugins that need to know
  // which model/record they're editing (data-reference autocomplete).
  // Even though the *editor* is persistent, the *runtime* changes per
  // edit session — and that's fine: it's a React context, not Lexical
  // editor state.
  const runtime = useMemo<LexicalOverlayRuntime | null>(() => {
    if (!node) return null
    const base = {
      nodeId: node.id,
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
  }, [node])

  // Track which node's content is currently loaded into the editor.
  // We avoid re-parsing the same JSON repeatedly (StrictMode + every
  // recipe update would otherwise stomp the user's in-progress edits).
  const loadedKeyRef = useRef<string>('')

  // ------------------------------------------------------------------
  // Load content & toggle edit mode when target node changes
  // ------------------------------------------------------------------
  useLayoutEffect(() => {
    if (!node) {
      console.log('[BuilderInlineEditor] no target node — setEditable(false)')
      editor.setEditable(false)
      loadedKeyRef.current = ''
      return
    }

    const key = `${node.id}:${node.version}`
    if (loadedKeyRef.current === key) {
      // Same content already loaded. Just make sure we're editable.
      editor.setEditable(true)
      return
    }

    console.log('[BuilderInlineEditor] loading node content', {
      nodeId: node.id,
      hasLexicalJson: !!node.lexicalJson,
    })

    if (node.lexicalJson) {
      try {
        const state = editor.parseEditorState(node.lexicalJson)
        // Skip setEditorState if the parsed state is empty — Lexical
        // throws on attempts to set a completely empty root.
        if (!state.isEmpty()) {
          editor.setEditorState(state)
        }
      } catch (error) {
        console.warn(
          '[BuilderInlineEditor] failed to parse lexicalJson, keeping current editor state',
          error,
        )
      }
    } else {
      // No saved content — clear the editor.
      editor.update(() => {
        const root = $getRoot()
        root.clear()
      })
    }

    editor.setEditable(true)
    loadedKeyRef.current = key

    // Focus on next frame so the contenteditable has settled visibly.
    requestAnimationFrame(() => {
      console.log('[BuilderInlineEditor] rAF focus')
      editor.focus()
    })
  }, [editor, node])

  // ------------------------------------------------------------------
  // Commit helpers
  // ------------------------------------------------------------------
  const commit = useCallback(() => {
    if (!node) {
      console.warn(
        '[BuilderInlineEditor] commit called but node is null — bail',
      )
      return
    }
    const editorState = editor.getEditorState()
    let lexicalJson = ''
    let html = ''
    editorState.read(() => {
      lexicalJson = JSON.stringify(editorState.toJSON())
      html = exportRenderTagHtml(editor)
    })
    const width = node.width || 1
    const contentHeight = Math.ceil(
      layout({ html, width, accuracy: renderTagAccuracy }).height,
    )
    console.log('[BuilderInlineEditor] commit', {
      nodeId: node.id,
      lexicalJsonPreview: lexicalJson.slice(0, 120),
      htmlPreview: html.slice(0, 120),
      contentHeight,
    })
    // (1) Update the canvas store so the Konva render reflects the
    //     edit instantly while the recipe round-trip is in flight.
    commitNodeText({ id: node.id, lexicalJson, html, contentHeight })
    // (2) Update the recipe DIRECTLY via the parent's handler. This is
    //     the source of truth; if the canvas store is later torn down
    //     (e.g. preview toggle remounts BuilderPreview), the recipe
    //     still has the user's edits.
    if (onCommitRef.current) {
      onCommitRef.current({
        nodeId: node.id,
        lexicalJson,
        html,
        contentHeight,
      })
    } else {
      console.warn(
        '[BuilderInlineEditor] no onCommit prop wired — edit only lives in the canvas store and will be lost on remount',
      )
    }
  }, [editor, node, commitNodeText])

  const commitAndExit = useCallback(() => {
    commit()
    console.log('[BuilderInlineEditor] commitAndExit → stopEditing')
    stopEditing()
  }, [commit, stopEditing])

  // ------------------------------------------------------------------
  // Keyboard / blur handlers — only registered while editing
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!isEditing) return

    let pendingBlurTimer: ReturnType<typeof setTimeout> | null = null
    const cancelPendingBlur = () => {
      if (pendingBlurTimer !== null) {
        clearTimeout(pendingBlurTimer)
        pendingBlurTimer = null
      }
    }

    const unregister = mergeRegister(
      editor.registerCommand(
        BLUR_COMMAND,
        () => {
          console.log('[BuilderInlineEditor] BLUR_COMMAND fired')
          cancelPendingBlur()
          pendingBlurTimer = setTimeout(() => {
            pendingBlurTimer = null
            console.log('[BuilderInlineEditor] BLUR settled → commitAndExit')
            commitAndExit()
          }, BLUR_COMMIT_SETTLE_MS)
          return true
        },
        COMMAND_PRIORITY_EDITOR,
      ),
      editor.registerCommand(
        FOCUS_COMMAND,
        () => {
          console.log(
            '[BuilderInlineEditor] FOCUS_COMMAND fired (cancel pending blur)',
          )
          cancelPendingBlur()
          return false
        },
        COMMAND_PRIORITY_EDITOR,
      ),
      editor.registerCommand(
        KEY_ESCAPE_COMMAND,
        (event) => {
          event.preventDefault()
          console.log('[BuilderInlineEditor] ESC → commitAndExit')
          cancelPendingBlur()
          commitAndExit()
          return true
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        (event) => {
          if (!event) return false
          if (event.metaKey || event.ctrlKey) {
            event.preventDefault()
            console.log('[BuilderInlineEditor] CMD+Enter → commitAndExit')
            cancelPendingBlur()
            commitAndExit()
            return true
          }
          event.preventDefault()
          return editor.dispatchCommand(INSERT_LINE_BREAK_COMMAND, false)
        },
        COMMAND_PRIORITY_EDITOR,
      ),
    )

    return () => {
      cancelPendingBlur()
      unregister()
    }
  }, [editor, isEditing, commitAndExit])

  // ------------------------------------------------------------------
  // Positioning & visibility
  // ------------------------------------------------------------------
  const isGroup = node?.kind === 'group'
  const editorHeight = node
    ? isGroup
      ? Math.max(node.contentHeight, 40)
      : node.height
    : 0
  const shapeDef = node ? getCanvasNodeShapeDefinition(node) : null
  const surfaceStroke = CANVAS_NODE_BORDER_FALLBACKS[resolvedTheme]

  const wrapperStyle: React.CSSProperties = useMemo(() => {
    if (!node || !shapeDef) {
      // Hidden when no target — but the editor stays mounted!
      return { display: 'none' }
    }
    return {
      position: 'absolute',
      top: 0,
      left: 0,
      width: node.width,
      height: editorHeight,
      background: isGroup ? 'transparent' : CANVAS_NODE_SURFACE_CSS_VALUE,
      borderRadius: shapeDef.cornerRadius,
      boxShadow: isGroup ? undefined : `inset 0 0 0 1px ${surfaceStroke}`,
      transform: `translate(${viewport.x + node.x * viewport.scale}px, ${
        viewport.y + node.y * viewport.scale
      }px) scale(${viewport.scale})`,
      transformOrigin: 'top left',
      zIndex: 10,
      pointerEvents: 'auto',
      boxSizing: 'border-box',
      overflow: 'visible',
    }
  }, [node, shapeDef, editorHeight, isGroup, surfaceStroke, viewport])

  // The runtime provider wraps the ENTIRE editor body — including the
  // contenteditable — because Lexical-rendered chips (DataReferenceChip)
  // live inside the contenteditable and need access to the context.
  // The value can be `null` when nothing is being edited; consumers
  // (chips) use `useOptionalLexicalOverlayRuntime` and degrade gracefully.
  return (
    <LexicalOverlayRuntimeProvider value={runtime}>
      <div
        className="absolute top-0 left-0"
        data-testid={TEST_IDS.LEXICAL_OVERLAY}
        style={wrapperStyle}
      >
        <style>{renderTagCss}</style>
        <RichTextPlugin
          contentEditable={
            <ContentEditable
              className="canvas-render-tag-root"
              style={isGroup ? groupEditorStyle : renderTagEditorStyle}
            />
          }
          placeholder={null}
          ErrorBoundary={LexicalErrorBoundary}
        />
        <HistoryPlugin />
        {/* `{{` typeahead — only mounted while a node is being edited so
           that the autocomplete's useSuspenseQuery doesn't fire when idle. */}
        {runtime ? (
          <>
            <DataReferencePlugin />
            <Suspense fallback={null}>
              <DataReferenceAutocomplete />
            </Suspense>
          </>
        ) : null}
      </div>
    </LexicalOverlayRuntimeProvider>
  )
}

const groupEditorStyle = {
  ...renderTagEditorStyle,
  justifyContent: 'flex-start' as const,
  textAlign: 'left' as const,
}
