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
  useState,
} from 'react'
import type { CSSProperties, MouseEvent, MutableRefObject } from 'react'
import {
  $getSelection,
  $getRoot,
  $isRangeSelection,
  BLUR_COMMAND,
  COMMAND_PRIORITY_EDITOR,
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_LOW,
  FOCUS_COMMAND,
  FORMAT_TEXT_COMMAND,
  INSERT_LINE_BREAK_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  SELECTION_CHANGE_COMMAND,
} from 'lexical'
import type { LexicalEditor, TextFormatType } from 'lexical'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $getSelectionStyleValueForProperty,
  $patchStyleText,
} from '@lexical/selection'
import { mergeRegister } from '@lexical/utils'
import { BoldIcon, ItalicIcon, PaletteIcon, UnderlineIcon } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { layout } from 'render-tag'
import { useTranslation } from 'react-i18next'

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
import { APPLY_INLINE_TEXT_STYLE_COMMAND } from '@/features/lexical/dataReference/commands'
import { DataReferencePlugin } from '@/features/lexical/dataReference/DataReferencePlugin'
import { DataReferenceAutocomplete } from '@/features/lexical/dataReference/DataReferenceAutocomplete'
import { LexicalOverlayRuntimeProvider } from '@/features/lexical/LexicalOverlayRuntimeContext'
import type { LexicalOverlayRuntime } from '@/features/lexical/LexicalOverlayRuntimeContext'
import { hasDataScope } from '@/features/canvas/model/types'
import { TEST_IDS } from '@/constants'
import { cn } from '@/lib/utils'

// Time window during which a transient BLUR (e.g. StrictMode-induced)
// can be cancelled by a follow-up FOCUS before it commits.
const BLUR_COMMIT_SETTLE_MS = 100
const INLINE_TOOLBAR_OFFSET_PX = 38
const DEFAULT_INLINE_TEXT_COLOR = '#111827'

type InlineToolbarFormat = Extract<
  TextFormatType,
  'bold' | 'italic' | 'underline'
>

const INLINE_TOOLBAR_ITEMS = [
  {
    format: 'bold',
    Icon: BoldIcon,
    labelKey: 'builder.inlineToolbar.bold',
  },
  {
    format: 'italic',
    Icon: ItalicIcon,
    labelKey: 'builder.inlineToolbar.italic',
  },
  {
    format: 'underline',
    Icon: UnderlineIcon,
    labelKey: 'builder.inlineToolbar.underline',
  },
] as const satisfies ReadonlyArray<{
  format: InlineToolbarFormat
  Icon: LucideIcon
  labelKey: string
}>

type InlineToolbarFormatState = Record<InlineToolbarFormat, boolean> & {
  color: string
}

type InlineEditorNode = NonNullable<ReturnType<typeof useCanvasNodes>[string]>
type CanvasActions = ReturnType<typeof useCanvasActions>
type CanvasViewport = ReturnType<typeof useCanvasViewport>
type ResolvedTheme = ReturnType<typeof useTheme>['resolvedTheme']

const EMPTY_INLINE_TOOLBAR_FORMAT_STATE: InlineToolbarFormatState = {
  bold: false,
  color: DEFAULT_INLINE_TEXT_COLOR,
  italic: false,
  underline: false,
}

function normalizeCssColorToHex(color: string) {
  const trimmed = color.trim()
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed
  const shortHex = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(trimmed)
  if (shortHex) {
    return `#${shortHex[1]}${shortHex[1]}${shortHex[2]}${shortHex[2]}${shortHex[3]}${shortHex[3]}`
  }
  const rgb = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/i.exec(trimmed)
  if (rgb) {
    return `#${[rgb[1], rgb[2], rgb[3]]
      .map((channel) =>
        Math.max(0, Math.min(255, Number(channel)))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')}`
  }
  return DEFAULT_INLINE_TEXT_COLOR
}

function readInlineToolbarFormatState(): InlineToolbarFormatState {
  const selection = $getSelection()
  if (!$isRangeSelection(selection)) {
    return EMPTY_INLINE_TOOLBAR_FORMAT_STATE
  }
  const color = $getSelectionStyleValueForProperty(selection, 'color', '')
  return {
    bold: selection.hasFormat('bold'),
    color: normalizeCssColorToHex(color || DEFAULT_INLINE_TEXT_COLOR),
    italic: selection.hasFormat('italic'),
    underline: selection.hasFormat('underline'),
  }
}

function areInlineToolbarFormatStatesEqual(
  a: InlineToolbarFormatState,
  b: InlineToolbarFormatState,
) {
  return (
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.underline === b.underline &&
    a.color === b.color
  )
}

function preventEditorBlur(event: MouseEvent) {
  event.preventDefault()
}

function insertTemplateToken() {
  const selection = $getSelection()
  if ($isRangeSelection(selection)) {
    selection.insertText('{{')
  }
}

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

export type FlushInlineNodeEdit = () => boolean

export type BuilderInlineEditorProps = {
  /**
   * Direct commit pipe to the recipe — called when the user finishes
   * editing (blur / esc / cmd-enter). Avoids the canvas-store →
   * CommitBridge → BuilderPage chain so the recipe is updated reliably
   * even if the canvas store is later torn down (e.g. on preview toggle).
   */
  onCommit?: (commit: BuilderInlineEditorCommit) => void
  onRegisterFlush?: (flush: FlushInlineNodeEdit | null) => void
}

export function BuilderInlineEditor({
  onCommit,
  onRegisterFlush,
}: BuilderInlineEditorProps) {
  return (
    <LexicalComposer initialConfig={INITIAL_CONFIG}>
      <BuilderInlineEditorBody
        onCommit={onCommit}
        onRegisterFlush={onRegisterFlush}
      />
    </LexicalComposer>
  )
}

function BuilderInlineEditorBody({
  onCommit,
  onRegisterFlush,
}: BuilderInlineEditorProps) {
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
  const isGroup = node?.kind === 'group'

  const runtime = useInlineEditorRuntime(node)
  useLoadInlineEditorNode(editor, node)
  const commit = useInlineEditorCommit({
    commitNodeText,
    editor,
    node,
    onCommitRef,
  })
  const commitAndExit = useCallback(() => {
    commit()
    console.log('[BuilderInlineEditor] commitAndExit → stopEditing')
    stopEditing()
  }, [commit, stopEditing])
  const { cancelPendingBlur, scheduleBlurCommit } =
    usePendingInlineEditorBlur(commitAndExit)
  const flushInlineNodeEdit = useCallback(() => {
    if (!node) return false
    cancelPendingBlur()
    const didCommit = commit()
    if (didCommit) stopEditing()
    return didCommit
  }, [cancelPendingBlur, commit, node, stopEditing])
  useRegisterInlineEditorFlush(onRegisterFlush, flushInlineNodeEdit)
  useInlineEditorCommands({
    cancelPendingBlur,
    commitAndExit,
    editor,
    isEditing,
    scheduleBlurCommit,
  })
  const { toolbarStyle, wrapperStyle } = useInlineEditorStyles({
    node,
    resolvedTheme,
    viewport,
  })

  // The runtime provider wraps the ENTIRE editor body — including the
  // contenteditable — because Lexical-rendered chips (DataReferenceChip)
  // live inside the contenteditable and need access to the context.
  // The value can be `null` when nothing is being edited; consumers
  // (chips) use `useOptionalLexicalOverlayRuntime` and degrade gracefully.
  return (
    <LexicalOverlayRuntimeProvider value={runtime}>
      {isEditing ? <InlineLexicalToolbar style={toolbarStyle} /> : null}
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

function useInlineEditorRuntime(node: InlineEditorNode | null) {
  return useMemo<LexicalOverlayRuntime | null>(() => {
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
}

function useLoadInlineEditorNode(
  editor: LexicalEditor,
  node: InlineEditorNode | null,
) {
  const loadedKeyRef = useRef<string>('')

  useLayoutEffect(() => {
    if (!node) {
      console.log('[BuilderInlineEditor] no target node — setEditable(false)')
      editor.setEditable(false)
      loadedKeyRef.current = ''
      return
    }

    const key = `${node.id}:${node.version}`
    if (loadedKeyRef.current === key) {
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
        if (!state.isEmpty()) editor.setEditorState(state)
      } catch (error) {
        console.warn(
          '[BuilderInlineEditor] failed to parse lexicalJson, keeping current editor state',
          error,
        )
      }
    } else {
      editor.update(() => {
        const root = $getRoot()
        root.clear()
      })
    }

    editor.setEditable(true)
    loadedKeyRef.current = key

    requestAnimationFrame(() => {
      console.log('[BuilderInlineEditor] rAF focus')
      editor.focus()
    })
  }, [editor, node])
}

function useInlineEditorCommit({
  commitNodeText,
  editor,
  node,
  onCommitRef,
}: {
  commitNodeText: CanvasActions['commitNodeText']
  editor: LexicalEditor
  node: InlineEditorNode | null
  onCommitRef: MutableRefObject<
    BuilderInlineEditorProps['onCommit'] | undefined
  >
}) {
  return useCallback(() => {
    if (!node) {
      console.warn(
        '[BuilderInlineEditor] commit called but node is null — bail',
      )
      return false
    }
    const editorState = editor.getEditorState()
    let lexicalJson = ''
    let html = ''
    editorState.read(() => {
      lexicalJson = JSON.stringify(editorState.toJSON())
      html = exportRenderTagHtml(editor)
    })
    const contentHeight = Math.ceil(
      layout({ html, width: node.width || 1, accuracy: renderTagAccuracy })
        .height,
    )
    console.log('[BuilderInlineEditor] commit', {
      nodeId: node.id,
      lexicalJsonPreview: lexicalJson.slice(0, 120),
      htmlPreview: html.slice(0, 120),
      contentHeight,
    })
    commitNodeText({ id: node.id, lexicalJson, html, contentHeight })
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
    return true
  }, [editor, node, commitNodeText, onCommitRef])
}

function usePendingInlineEditorBlur(commitAndExit: () => void) {
  const pendingBlurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cancelPendingBlur = useCallback(() => {
    if (pendingBlurTimerRef.current !== null) {
      clearTimeout(pendingBlurTimerRef.current)
      pendingBlurTimerRef.current = null
    }
  }, [])

  const scheduleBlurCommit = useCallback(() => {
    cancelPendingBlur()
    pendingBlurTimerRef.current = setTimeout(() => {
      pendingBlurTimerRef.current = null
      console.log('[BuilderInlineEditor] BLUR settled → commitAndExit')
      commitAndExit()
    }, BLUR_COMMIT_SETTLE_MS)
  }, [cancelPendingBlur, commitAndExit])

  useEffect(() => cancelPendingBlur, [cancelPendingBlur])

  return { cancelPendingBlur, scheduleBlurCommit }
}

function useRegisterInlineEditorFlush(
  onRegisterFlush: BuilderInlineEditorProps['onRegisterFlush'],
  flushInlineNodeEdit: FlushInlineNodeEdit,
) {
  useEffect(() => {
    onRegisterFlush?.(flushInlineNodeEdit)
    return () => {
      onRegisterFlush?.(null)
    }
  }, [flushInlineNodeEdit, onRegisterFlush])
}

function useInlineEditorCommands({
  cancelPendingBlur,
  commitAndExit,
  editor,
  isEditing,
  scheduleBlurCommit,
}: {
  cancelPendingBlur: () => void
  commitAndExit: () => void
  editor: LexicalEditor
  isEditing: boolean
  scheduleBlurCommit: () => void
}) {
  useEffect(() => {
    if (!isEditing) return cancelPendingBlur

    const unregister = mergeRegister(
      editor.registerCommand(
        BLUR_COMMAND,
        () => {
          console.log('[BuilderInlineEditor] BLUR_COMMAND fired')
          scheduleBlurCommit()
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
  }, [editor, isEditing, cancelPendingBlur, commitAndExit, scheduleBlurCommit])
}

function useInlineEditorStyles({
  node,
  resolvedTheme,
  viewport,
}: {
  node: InlineEditorNode | null
  resolvedTheme: ResolvedTheme
  viewport: CanvasViewport
}) {
  return useMemo(() => {
    const toolbarStyle: CSSProperties = !node
      ? { display: 'none' }
      : {
          position: 'absolute',
          top: Math.max(
            8,
            viewport.y + node.y * viewport.scale - INLINE_TOOLBAR_OFFSET_PX,
          ),
          left: viewport.x + (node.x + node.width / 2) * viewport.scale,
          transform: 'translateX(-50%)',
          zIndex: 20,
          pointerEvents: 'auto',
        }

    if (!node) {
      return { toolbarStyle, wrapperStyle: { display: 'none' } }
    }

    const isGroup = node.kind === 'group'
    const shapeDef = getCanvasNodeShapeDefinition(node)
    const editorHeight = isGroup
      ? Math.max(node.contentHeight, 40)
      : node.height
    const surfaceStroke = CANVAS_NODE_BORDER_FALLBACKS[resolvedTheme]
    const wrapperStyle: CSSProperties = {
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

    return { toolbarStyle, wrapperStyle }
  }, [node, resolvedTheme, viewport])
}

function InlineLexicalToolbar({ style }: { style: CSSProperties }) {
  const [editor] = useLexicalComposerContext()
  const { t } = useTranslation()
  const [formatState, setFormatState] = useState(
    EMPTY_INLINE_TOOLBAR_FORMAT_STATE,
  )

  const updateFormatState = useCallback(
    (nextState: InlineToolbarFormatState) => {
      setFormatState((currentState) =>
        areInlineToolbarFormatStatesEqual(currentState, nextState)
          ? currentState
          : nextState,
      )
    },
    [],
  )

  useEffect(() => {
    editor.getEditorState().read(() => {
      updateFormatState(readInlineToolbarFormatState())
    })

    return mergeRegister(
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(() => {
          updateFormatState(readInlineToolbarFormatState())
        })
      }),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          updateFormatState(readInlineToolbarFormatState())
          return false
        },
        COMMAND_PRIORITY_LOW,
      ),
    )
  }, [editor, updateFormatState])

  const formatText = useCallback(
    (format: InlineToolbarFormat) => {
      editor.focus(() => {
        editor.dispatchCommand(FORMAT_TEXT_COMMAND, format)
      })
    },
    [editor],
  )

  const insertFieldToken = useCallback(() => {
    editor.focus(() => {
      editor.update(insertTemplateToken)
    })
  }, [editor])

  const applyTextColor = useCallback(
    (color: string) => {
      editor.focus(() => {
        editor.update(() => {
          const selection = $getSelection()
          if ($isRangeSelection(selection)) {
            $patchStyleText(selection, { color })
          }
        })
        editor.dispatchCommand(APPLY_INLINE_TEXT_STYLE_COMMAND, { color })
      })
    },
    [editor],
  )

  const controlClass =
    'flex h-7 min-w-7 items-center justify-center rounded-[5px] px-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40'

  return (
    <div
      role="toolbar"
      aria-label={t('builder.inlineToolbar.label')}
      className="absolute flex items-center gap-0.5 rounded-md border border-border bg-background/95 p-0.5 shadow-[0_1px_3px_rgba(0,0,0,0.12)]"
      onMouseDown={preventEditorBlur}
      style={style}
    >
      {INLINE_TOOLBAR_ITEMS.map(({ format, Icon, labelKey }) => {
        const label = t(labelKey)
        const isActive = formatState[format]
        return (
          <button
            key={format}
            type="button"
            className={cn(
              controlClass,
              isActive && 'bg-accent text-foreground',
            )}
            aria-label={label}
            aria-pressed={isActive}
            title={label}
            onClick={() => formatText(format)}
          >
            <Icon className="size-3.5" aria-hidden="true" />
          </button>
        )
      })}
      <span className="mx-0.5 h-4 w-px bg-border" aria-hidden="true" />
      <label
        className={cn(controlClass, 'relative cursor-pointer overflow-hidden')}
        title={t('builder.inlineToolbar.textColor')}
      >
        <PaletteIcon className="size-3.5" aria-hidden="true" />
        <span
          className="absolute bottom-1 h-0.5 w-3 rounded-full"
          style={{ backgroundColor: formatState.color }}
        />
        <span className="sr-only">{t('builder.inlineToolbar.textColor')}</span>
        <input
          className="absolute inset-0 h-full w-full cursor-pointer appearance-none border-0 p-0 opacity-0"
          aria-label={t('builder.inlineToolbar.textColor')}
          type="color"
          value={formatState.color}
          onChange={(event) => applyTextColor(event.target.value)}
        />
      </label>
      <button
        type="button"
        className={cn(controlClass, 'font-mono text-[11px]')}
        aria-label={t('builder.inlineToolbar.insertTemplate')}
        title={t('builder.inlineToolbar.insertTemplate')}
        onClick={insertFieldToken}
      >
        <span>{'{{'}</span>
      </button>
    </div>
  )
}

const groupEditorStyle = {
  ...renderTagEditorStyle,
  justifyContent: 'flex-start' as const,
  textAlign: 'left' as const,
}
