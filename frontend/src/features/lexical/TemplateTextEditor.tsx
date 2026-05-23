import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $getSelection,
  $isRangeSelection,
  FORMAT_TEXT_COMMAND,
  SELECTION_CHANGE_COMMAND,
  COMMAND_PRIORITY_LOW,
} from 'lexical'
import type { EditorState, TextFormatType } from 'lexical'
import { mergeRegister } from '@lexical/utils'
import { BoldIcon, BracesIcon, ItalicIcon, UnderlineIcon } from 'lucide-react'

import { DataReferenceAutocomplete } from './dataReference/DataReferenceAutocomplete'
import { DataReferenceNode } from './dataReference/DataReferenceNode'
import { DataReferencePlugin } from './dataReference/DataReferencePlugin'
import type { SchemaModelRef } from './dataReference/schemaQueries'
import { cn } from '@/lib/utils'
import { LexicalOverlayRuntimeProvider } from './LexicalOverlayRuntimeContext'
import type { LexicalOverlayRuntime } from './LexicalOverlayRuntimeContext'
import { renderTagCss, renderTagEditorStyle } from './exportRenderTagHtml'
import { stringifyTemplateTextContent } from './templateTextContent'
import { TextSizeDropdown } from './TextSizeDropdown'
import {
  applyTextSize,
  readSelectionTextSize,
  type TextSizePreset,
} from './textSizePresets'

type TemplateTextEditorProps = {
  dataScope: SchemaModelRef
  editorKey: string
  labels?: Partial<TemplateTextEditorLabels>
  onChange: (textContent: unknown) => void
  textContent: unknown
}

type TemplateTextEditorLabels = {
  bold: string
  editor: string
  insertField: string
  italic: string
  underline: string
}

const DEFAULT_LABELS: TemplateTextEditorLabels = {
  bold: 'Bold',
  editor: 'Node text',
  insertField: 'Insert field',
  italic: 'Italic',
  underline: 'Underline',
}

const TEMPLATE_EDITOR_NODE = {
  id: 'template-text-editor',
  kind: 'editable' as const,
  shape: 'box' as const,
  layoutMode: 'manual' as const,
  x: 0,
  y: 0,
  width: 280,
  height: 112,
  lexicalJson: '',
  html: '',
  contentHeight: 0,
  version: 1,
  appLabel: '',
  modelName: '',
}

function TemplateEditorOnChange({
  onChange,
}: {
  onChange: (textContent: unknown) => void
}) {
  const didSkipInitialChangeRef = useRef(false)

  return (
    <OnChangePlugin
      ignoreHistoryMergeTagChange
      ignoreSelectionChange
      onChange={(editorState: EditorState) => {
        if (!didSkipInitialChangeRef.current) {
          didSkipInitialChangeRef.current = true
          return
        }
        editorState.read(() => {
          onChange(editorState.toJSON())
        })
      }}
    />
  )
}

function TemplateEditorToolbar({
  labels,
}: {
  labels: TemplateTextEditorLabels
}) {
  const [editor] = useLexicalComposerContext()
  const [textSize, setTextSize] = useState<TextSizePreset>('normal')

  const updateTextSize = useCallback(
    (next: TextSizePreset) => {
      setTextSize((prev) => (prev === next ? prev : next))
    },
    [],
  )

  useEffect(() => {
    editor.getEditorState().read(() => {
      updateTextSize(readSelectionTextSize())
    })

    return mergeRegister(
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(() => {
          updateTextSize(readSelectionTextSize())
        })
      }),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          updateTextSize(readSelectionTextSize())
          return false
        },
        COMMAND_PRIORITY_LOW,
      ),
    )
  }, [editor, updateTextSize])

  function formatText(format: TextFormatType) {
    editor.focus(() => {
      editor.dispatchCommand(FORMAT_TEXT_COMMAND, format)
    })
  }

  function insertFieldToken() {
    editor.focus(() => {
      editor.update(() => {
        const selection = $getSelection()
        if ($isRangeSelection(selection)) {
          selection.insertText('{{')
        }
      })
    })
  }

  const controlClass =
    'flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'

  return (
    <div className="flex items-center gap-0.5 border-b border-border bg-muted/30 px-1.5 py-1">
      <button
        type="button"
        className={controlClass}
        aria-label={labels.bold}
        title={labels.bold}
        onClick={() => formatText('bold')}
      >
        <BoldIcon className="size-3.5" aria-hidden="true" />
      </button>
      <button
        type="button"
        className={controlClass}
        aria-label={labels.italic}
        title={labels.italic}
        onClick={() => formatText('italic')}
      >
        <ItalicIcon className="size-3.5" aria-hidden="true" />
      </button>
      <button
        type="button"
        className={controlClass}
        aria-label={labels.underline}
        title={labels.underline}
        onClick={() => formatText('underline')}
      >
        <UnderlineIcon className="size-3.5" aria-hidden="true" />
      </button>
      <TextSizeDropdown
        activePreset={textSize}
        controlClass={controlClass}
        iconClass="size-3.5"
        onSelect={(preset) => applyTextSize(editor, preset)}
      />
      <span className="mx-1 h-4 w-px bg-border" />
      <button
        type="button"
        className={cn(controlClass, 'w-auto gap-1 px-2 font-mono text-[11px]')}
        aria-label={labels.insertField}
        title={labels.insertField}
        onClick={insertFieldToken}
      >
        <BracesIcon className="size-3.5" aria-hidden="true" />
        <span>{'{{ }}'}</span>
      </button>
    </div>
  )
}

export function TemplateTextEditor({
  dataScope,
  editorKey,
  labels: labelsOverride,
  onChange,
  textContent,
}: TemplateTextEditorProps) {
  const labels = { ...DEFAULT_LABELS, ...labelsOverride }
  const initialConfig = useMemo(
    () => ({
      namespace: `template-text-${editorKey}`,
      editorState: stringifyTemplateTextContent(textContent),
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
      nodes: [DataReferenceNode],
    }),
    [editorKey, textContent],
  )
  const runtime = useMemo<LexicalOverlayRuntime>(
    () => ({
      nodeId: TEMPLATE_EDITOR_NODE.id,
      node: {
        ...TEMPLATE_EDITOR_NODE,
        appLabel: dataScope.appLabel,
        modelName: dataScope.modelName,
        lexicalJson: stringifyTemplateTextContent(textContent),
      },
      shapeDefinition: {
        name: 'box',
        defaultSize: { width: 280, height: 112 },
        minSize: { width: 120, height: 64 },
        cornerRadius: 8,
      },
      dataScope,
    }),
    [dataScope, textContent],
  )

  return (
    <div className="overflow-visible rounded-md border border-input bg-background focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
      <style>{renderTagCss}</style>
      <LexicalOverlayRuntimeProvider value={runtime}>
        <LexicalComposer key={editorKey} initialConfig={initialConfig}>
          <TemplateEditorToolbar labels={labels} />
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                aria-label={labels.editor}
                className="canvas-render-tag-root min-h-32"
                spellCheck
                style={{
                  ...renderTagEditorStyle,
                  alignItems: 'stretch',
                  height: 'auto',
                  justifyContent: 'flex-start',
                  minHeight: 128,
                  textAlign: 'left',
                }}
              />
            }
            placeholder={null}
            ErrorBoundary={LexicalErrorBoundary}
          />
          <HistoryPlugin />
          <TemplateEditorOnChange onChange={onChange} />
          <DataReferencePlugin />
          <Suspense fallback={null}>
            <DataReferenceAutocomplete />
          </Suspense>
        </LexicalComposer>
      </LexicalOverlayRuntimeProvider>
    </div>
  )
}
