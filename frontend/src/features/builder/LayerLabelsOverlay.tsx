/**
 * LayerLabelsOverlay — HTML overlay for interactive layer labels on the canvas.
 *
 * Layer labels are rendered as Konva text in the background layer for visual
 * display (so they sit behind nodes). This component adds invisible HTML click
 * targets at the same positions. On double-click, a lightweight Lexical editor
 * appears in-place — the same rich-text editing experience as node text, but
 * without template/data-reference support.
 *
 * The underlying Konva label hides while editing (controlled by the
 * `editingLayerLabelId` prop on the scaffold).
 *
 * The positioning math mirrors `BuilderPreviewLayerScaffold`:
 *   worldX/worldY -> viewport transform -> CSS absolute + translate + scale.
 */

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import type { CSSProperties, MouseEvent } from 'react'
import {
  $getRoot,
  $getSelection,
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
import type { TextFormatType } from 'lexical'
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
import { useTranslation } from 'react-i18next'

import {
  useCanvasNodes,
  useCanvasViewport,
} from '@/store/canvasStore'
import { renderTagCss } from '@/features/lexical/exportRenderTagHtml'
import type { CanvasNode } from '@/features/canvas/model/types'
import { cn } from '@/lib/utils'
import { createTemplateTextContent } from '@/features/lexical/templateTextContent'
import { TextSizeDropdown } from '@/features/lexical/TextSizeDropdown'
import {
  applyTextSize,
  readSelectionTextSize,
  type TextSizePreset,
} from '@/features/lexical/textSizePresets'
import type { BuilderPreviewCanvasLayer } from './builderPreviewLayout'

// ---------------------------------------------------------------------------
// Constants — match BuilderPreviewLayerScaffold positioning
// ---------------------------------------------------------------------------

const LAYER_LABEL_MIN_WIDTH = 160
const LAYER_LABEL_TOP_GAP = 30
const LABEL_HEIGHT = 16
const BLUR_COMMIT_SETTLE_MS = 100
const INLINE_TOOLBAR_OFFSET_PX = 32
const DEFAULT_INLINE_TEXT_COLOR = '#71717a'

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

function getLayerBounds(
  layer: BuilderPreviewCanvasLayer,
  nodes: Record<string, CanvasNode>,
) {
  const frames = layer.nodeIds.flatMap((nodeId) => {
    const node = nodes[nodeId]
    return node ? [node] : []
  })

  if (frames.length === 0) return null

  const minX = Math.min(...frames.map((node) => node.x))
  const maxX = Math.max(...frames.map((node) => node.x + node.width))
  const minY = Math.min(...frames.map((node) => node.y))

  return { maxX, minX, minY }
}

// ---------------------------------------------------------------------------
// Inline toolbar (bold/italic/underline/color — no template token)
// ---------------------------------------------------------------------------

type InlineToolbarFormat = Extract<
  TextFormatType,
  'bold' | 'italic' | 'underline'
>

type InlineToolbarFormatState = Record<InlineToolbarFormat, boolean> & {
  color: string
  textSize: TextSizePreset
}

const EMPTY_FORMAT_STATE: InlineToolbarFormatState = {
  bold: false,
  color: DEFAULT_INLINE_TEXT_COLOR,
  italic: false,
  textSize: 'normal',
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

function readFormatState(): InlineToolbarFormatState {
  const selection = $getSelection()
  if (!$isRangeSelection(selection)) return EMPTY_FORMAT_STATE
  const color = $getSelectionStyleValueForProperty(selection, 'color', '')
  return {
    bold: selection.hasFormat('bold'),
    color: normalizeCssColorToHex(color || DEFAULT_INLINE_TEXT_COLOR),
    italic: selection.hasFormat('italic'),
    textSize: readSelectionTextSize(),
    underline: selection.hasFormat('underline'),
  }
}

function preventEditorBlur(event: MouseEvent) {
  event.preventDefault()
}

function LayerLabelToolbar({ style }: { style: CSSProperties }) {
  const [editor] = useLexicalComposerContext()
  const { t } = useTranslation()
  const [formatState, setFormatState] = useState(EMPTY_FORMAT_STATE)

  useEffect(() => {
    editor.getEditorState().read(() => {
      setFormatState(readFormatState())
    })

    return mergeRegister(
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(() => {
          setFormatState(readFormatState())
        })
      }),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          setFormatState(readFormatState())
          return false
        },
        COMMAND_PRIORITY_LOW,
      ),
    )
  }, [editor])

  const formatText = useCallback(
    (format: InlineToolbarFormat) => {
      editor.focus(() => {
        editor.dispatchCommand(FORMAT_TEXT_COMMAND, format)
      })
    },
    [editor],
  )

  const applyTextColor = useCallback(
    (color: string) => {
      editor.focus(() => {
        editor.update(() => {
          const selection = $getSelection()
          if ($isRangeSelection(selection)) {
            $patchStyleText(selection, { color })
          }
        })
      })
    },
    [editor],
  )

  const controlClass =
    'flex h-6 min-w-6 items-center justify-center rounded-[4px] px-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40'

  const items = [
    { format: 'bold' as const, Icon: BoldIcon, label: t('builder.inlineToolbar.bold') },
    { format: 'italic' as const, Icon: ItalicIcon, label: t('builder.inlineToolbar.italic') },
    { format: 'underline' as const, Icon: UnderlineIcon, label: t('builder.inlineToolbar.underline') },
  ]

  return (
    <div
      role="toolbar"
      aria-label={t('builder.inlineToolbar.label')}
      className="absolute flex items-center gap-0.5 rounded-md border border-border bg-background/95 p-0.5 shadow-[0_1px_3px_rgba(0,0,0,0.12)]"
      onMouseDown={preventEditorBlur}
      style={style}
    >
      {items.map(({ format, Icon, label }) => {
        const isActive = formatState[format]
        return (
          <button
            key={format}
            type="button"
            className={cn(controlClass, isActive && 'bg-accent text-foreground')}
            aria-label={label}
            aria-pressed={isActive}
            title={label}
            onClick={() => formatText(format)}
          >
            <Icon className="size-3" aria-hidden="true" />
          </button>
        )
      })}
      <TextSizeDropdown
        activePreset={formatState.textSize}
        controlClass={controlClass}
        iconClass="size-3"
        onSelect={(preset) => applyTextSize(editor, preset)}
      />
      <span className="mx-0.5 h-3.5 w-px bg-border" aria-hidden="true" />
      <label
        className={cn(controlClass, 'relative cursor-pointer overflow-hidden')}
        title={t('builder.inlineToolbar.textColor')}
      >
        <PaletteIcon className="size-3" aria-hidden="true" />
        <span
          className="absolute bottom-0.5 h-0.5 w-2.5 rounded-full"
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
    </div>
  )
}

// ---------------------------------------------------------------------------
// Lexical editor for a single layer label
// ---------------------------------------------------------------------------

const LAYER_LABEL_EDITOR_CONFIG = {
  namespace: 'layer-label-editor',
  // Start editable — the LexicalComposer is only mounted while editing,
  // so we can be editable from the start. This avoids the race where
  // the ContentEditable isn't yet interactive when we try to focus.
  editable: true,
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
}

type LayerLabelEditorCommit = {
  layerId: string
  label: string
  textContent: unknown
}

function LayerLabelEditorBody({
  layer,
  onCommit,
  onCancel,
  wrapperStyle,
  toolbarStyle,
}: {
  layer: BuilderPreviewCanvasLayer
  onCommit: (commit: LayerLabelEditorCommit) => void
  onCancel: () => void
  wrapperStyle: CSSProperties
  toolbarStyle: CSSProperties
}) {
  const [editor] = useLexicalComposerContext()
  const onCommitRef = useRef(onCommit)
  onCommitRef.current = onCommit
  const onCancelRef = useRef(onCancel)
  onCancelRef.current = onCancel
  const pendingBlurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load content once on mount — the LexicalComposer is created fresh
  // per editing session (keyed by layer.id), so this runs exactly once.
  useLayoutEffect(() => {
    const textContent = layer.textContent
    const label = layer.label

    if (textContent) {
      try {
        const raw =
          typeof textContent === 'string'
            ? textContent
            : JSON.stringify(textContent)
        const state = editor.parseEditorState(raw)
        if (!state.isEmpty()) {
          editor.setEditorState(state)
        }
      } catch {
        // Fallback: create from plain label
        const fallback = createTemplateTextContent(label)
        try {
          editor.setEditorState(
            editor.parseEditorState(JSON.stringify(fallback)),
          )
        } catch {
          // give up
        }
      }
    } else {
      // No textContent — seed from plain label
      const initial = createTemplateTextContent(label)
      try {
        editor.setEditorState(
          editor.parseEditorState(JSON.stringify(initial)),
        )
      } catch {
        // give up
      }
    }

    // Double-rAF to ensure the contenteditable is settled before focusing.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        editor.focus(() => {
          // Select all text so the user can immediately type to replace
          editor.update(() => {
            const root = $getRoot()
            root.selectEnd()
          })
        })
      })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on mount
  }, [editor])

  // Commit helper
  const commit = useCallback(() => {
    const editorState = editor.getEditorState()
    let textContent: unknown = null
    let plainText = ''
    editorState.read(() => {
      textContent = editorState.toJSON()
      plainText = $getRoot().getTextContent()
    })
    onCommitRef.current({
      layerId: layer.id,
      label: plainText.trim() || layer.label,
      textContent,
    })
  }, [editor, layer.id, layer.label])

  const commitAndExit = useCallback(() => {
    commit()
  }, [commit])

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
      commitAndExit()
    }, BLUR_COMMIT_SETTLE_MS)
  }, [cancelPendingBlur, commitAndExit])

  useEffect(() => cancelPendingBlur, [cancelPendingBlur])

  // Keyboard / blur handlers
  useEffect(() => {
    const unregister = mergeRegister(
      editor.registerCommand(
        BLUR_COMMAND,
        () => {
          scheduleBlurCommit()
          return true
        },
        COMMAND_PRIORITY_EDITOR,
      ),
      editor.registerCommand(
        FOCUS_COMMAND,
        () => {
          cancelPendingBlur()
          return false
        },
        COMMAND_PRIORITY_EDITOR,
      ),
      editor.registerCommand(
        KEY_ESCAPE_COMMAND,
        (event) => {
          event.preventDefault()
          cancelPendingBlur()
          onCancelRef.current()
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
            cancelPendingBlur()
            commitAndExit()
            return true
          }
          // Allow shift+enter for line breaks
          if (event.shiftKey) {
            return editor.dispatchCommand(INSERT_LINE_BREAK_COMMAND, false)
          }
          // Plain Enter commits
          event.preventDefault()
          cancelPendingBlur()
          commitAndExit()
          return true
        },
        COMMAND_PRIORITY_EDITOR,
      ),
    )

    return () => {
      cancelPendingBlur()
      unregister()
    }
  }, [editor, cancelPendingBlur, commitAndExit, scheduleBlurCommit])

  return (
    <>
      <LayerLabelToolbar style={toolbarStyle} />
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div
        style={wrapperStyle}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <style>{renderTagCss}</style>
        <RichTextPlugin
          contentEditable={
            <ContentEditable
              className="canvas-render-tag-root"
              style={layerLabelEditorStyle}
            />
          }
          placeholder={null}
          ErrorBoundary={LexicalErrorBoundary}
        />
        <HistoryPlugin />
      </div>
    </>
  )
}

const layerLabelEditorStyle: Record<string, string | number> = {
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  width: '100%',
  minHeight: LABEL_HEIGHT,
  margin: 0,
  padding: '2px 4px',
  outline: 'none',
  color: 'var(--foreground, rgb(0, 0, 0))',
  caretColor: 'var(--foreground, rgb(0, 0, 0))',
  cursor: 'text',
  overflow: 'visible',
  overflowWrap: 'break-word',
  whiteSpace: 'normal',
  textAlign: 'center',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 11,
  fontWeight: 'bold',
  letterSpacing: 3,
  lineHeight: 1.3,
}

// ---------------------------------------------------------------------------
// Overlay — positions the editor / click targets over layer labels
// ---------------------------------------------------------------------------

export type LayerLabelCommit = {
  layerId: string
  label: string
  textContent: unknown
}

type LayerLabelsOverlayProps = {
  editingId: string | null
  layers: BuilderPreviewCanvasLayer[]
  onCommitEdit: (commit: LayerLabelCommit) => void
  onStartEdit: (layerId: string) => void
}

export const LayerLabelsOverlay = memo(function LayerLabelsOverlay({
  editingId,
  layers,
  onCommitEdit,
  onStartEdit,
}: LayerLabelsOverlayProps) {
  const nodes = useCanvasNodes()
  const viewport = useCanvasViewport()

  return (
    <>
      {layers.map((layer) => {
        const bounds = getLayerBounds(layer, nodes)
        if (!bounds) return null

        const columnWidth = Math.max(
          LAYER_LABEL_MIN_WIDTH,
          bounds.maxX - bounds.minX,
        )
        const worldX =
          bounds.minX + (bounds.maxX - bounds.minX - columnWidth) / 2
        const worldY = Math.max(4, bounds.minY - LAYER_LABEL_TOP_GAP)
        const isEditing = editingId === layer.id

        if (isEditing) {
          const wrapperStyle: CSSProperties = {
            position: 'absolute',
            top: 0,
            left: 0,
            width: columnWidth,
            minHeight: LABEL_HEIGHT,
            transform: `translate(${viewport.x + worldX * viewport.scale}px, ${
              viewport.y + worldY * viewport.scale
            }px) scale(${viewport.scale})`,
            transformOrigin: 'top left',
            zIndex: 10,
            pointerEvents: 'auto',
            boxSizing: 'border-box',
            background: 'var(--background)',
            borderRadius: 4,
            boxShadow: '0 0 0 1px var(--border), 0 2px 8px rgba(0,0,0,0.08)',
          }

          const toolbarStyle: CSSProperties = {
            position: 'absolute',
            top: Math.max(
              8,
              viewport.y + worldY * viewport.scale - INLINE_TOOLBAR_OFFSET_PX,
            ),
            left:
              viewport.x +
              (worldX + columnWidth / 2) * viewport.scale,
            transform: 'translateX(-50%)',
            zIndex: 20,
            pointerEvents: 'auto',
          }

          return (
            <LexicalComposer
              key={`edit-${layer.id}`}
              initialConfig={LAYER_LABEL_EDITOR_CONFIG}
            >
              <LayerLabelEditorBody
                layer={layer}
                onCommit={onCommitEdit}
                onCancel={() =>
                  onCommitEdit({
                    layerId: layer.id,
                    label: layer.label,
                    textContent: layer.textContent ?? null,
                  })
                }
                wrapperStyle={wrapperStyle}
                toolbarStyle={toolbarStyle}
              />
            </LexicalComposer>
          )
        }

        return (
          <div
            key={layer.id}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: columnWidth,
              height: LABEL_HEIGHT,
              transform: `translate(${viewport.x + worldX * viewport.scale}px, ${
                viewport.y + worldY * viewport.scale
              }px) scale(${viewport.scale})`,
              transformOrigin: 'top left',
              zIndex: 5,
              pointerEvents: 'auto',
            }}
          >
            <button
              type="button"
              onDoubleClick={() => onStartEdit(layer.id)}
              className="block h-full w-full cursor-text bg-transparent text-center"
              style={{
                fontFamily:
                  'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: 11,
                fontWeight: 'bold',
                letterSpacing: 3,
                lineHeight: `${LABEL_HEIGHT}px`,
                color: 'transparent',
              }}
              aria-label={`Rename layer "${layer.label}"`}
            >
              {layer.label}
            </button>
          </div>
        )
      })}
    </>
  )
})
