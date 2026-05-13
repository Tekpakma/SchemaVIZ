import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useQueryClient, useSuspenseQueries, useSuspenseQuery } from '@tanstack/react-query'
import { layout } from 'render-tag'
import {
  BLUR_COMMAND,
  COMMAND_PRIORITY_EDITOR,
  COMMAND_PRIORITY_HIGH,
  INSERT_LINE_BREAK_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
} from 'lexical'
import { mergeRegister } from '@lexical/utils'

import { useCanvasActions } from '@/store/canvasStore'
import {
  exportRenderTagHtml,
  extractUnresolvedDeepPaths,
  renderTagAccuracy,
  resolveDeepPathSpans,
} from './exportRenderTagHtml'
import { formatReferenceDisplayValue } from './dataReference/fieldValues'
import { useLexicalOverlayRuntime } from './LexicalOverlayRuntimeContext'
import { SCHEMA_QUERIES } from './dataReference/schemaQueries'

function LexicalCommitPluginWithDataScope() {
  const [editor] = useLexicalComposerContext()
  const queryClient = useQueryClient()
  const { node, nodeId, dataScope } = useLexicalOverlayRuntime()
  const { commitNodeText, stopEditing } = useCanvasActions()
  const nodeWidth = node.width
  const didCommitRef = useRef(false)

  const rootRef = useMemo(
    () => ({
      appLabel: dataScope!.appLabel,
      modelName: dataScope!.modelName,
    }),
    [dataScope],
  )
  const [{ data: modelDetails }, { data: recordData }] = useSuspenseQueries({
    queries: [
      SCHEMA_QUERIES.modelDetails(rootRef),
      SCHEMA_QUERIES.record({
        ...rootRef,
        id: dataScope!.recordId,
      }),
    ],
  })

  useEffect(() => {
    didCommitRef.current = false
  }, [editor, nodeId])

  const commit = useCallback(async () => {
    if (didCommitRef.current || !nodeWidth) return true

    didCommitRef.current = true

    const editorState = editor.getEditorState()
    let lexicalJson = ''
    let html = ''

    editorState.read(() => {
      lexicalJson = JSON.stringify(editorState.toJSON())
      html = exportRenderTagHtml(editor, recordData.fields)
    })

    // Resolve deep dotted paths (e.g. "environment.name") asynchronously.
    // Flat fields were already resolved by exportRenderTagHtml above.
    const deepPaths = extractUnresolvedDeepPaths(html)

    if (deepPaths.length > 0 && dataScope!.recordId) {
      const resolved = new Map<string, string>()

      await Promise.all(
        deepPaths.map(async (path) => {
          try {
            const resolution = await queryClient.fetchQuery(
              SCHEMA_QUERIES.referenceResolution(
                rootRef,
                path,
                dataScope!.recordId!,
                {
                  rootModelDetails: modelDetails,
                  rootRecordFields: recordData.fields,
                },
              ),
            )
            if (resolution.status === 'resolved') {
              resolved.set(
                path,
                formatReferenceDisplayValue(resolution.value, resolution.field),
              )
            }
          } catch {
            // Leave as {{template}} — non-critical failure
          }
        }),
      )

      html = resolveDeepPathSpans(html, resolved)
    }

    const contentHeight = Math.ceil(
      layout({ html, width: nodeWidth, accuracy: renderTagAccuracy }).height,
    )

    commitNodeText({ id: nodeId, lexicalJson, html, contentHeight })
    stopEditing()

    return true
  }, [
    editor,
    queryClient,
    rootRef,
    nodeId,
    nodeWidth,
    dataScope,
    commitNodeText,
    stopEditing,
    recordData,
    modelDetails,
  ])

  return useLexicalCommitCommands(editor, commit)
}

function LexicalCommitPluginSimple() {
  const [editor] = useLexicalComposerContext()
  const { nodeId, node } = useLexicalOverlayRuntime()
  const { commitNodeText, stopEditing } = useCanvasActions()
  const nodeWidth = node.width
  const didCommitRef = useRef(false)

  useEffect(() => {
    didCommitRef.current = false
  }, [editor, nodeId])

  const commit = useCallback(async () => {
    if (didCommitRef.current || !nodeWidth) return true

    didCommitRef.current = true

    const editorState = editor.getEditorState()
    let lexicalJson = ''
    let html = ''

    editorState.read(() => {
      lexicalJson = JSON.stringify(editorState.toJSON())
      html = exportRenderTagHtml(editor)
    })

    const contentHeight = Math.ceil(
      layout({ html, width: nodeWidth, accuracy: renderTagAccuracy }).height,
    )

    commitNodeText({ id: nodeId, lexicalJson, html, contentHeight })
    stopEditing()

    return true
  }, [editor, nodeId, nodeWidth, commitNodeText, stopEditing])

  return useLexicalCommitCommands(editor, commit)
}

function useLexicalCommitCommands(
  editor: ReturnType<typeof useLexicalComposerContext>[0],
  commit: () => Promise<boolean>,
) {
  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        BLUR_COMMAND,
        () => {
          void commit()
          return true
        },
        COMMAND_PRIORITY_EDITOR,
      ),
      editor.registerCommand(
        KEY_ESCAPE_COMMAND,
        (event) => {
          event.preventDefault()
          void commit()
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
            void commit()
            return true
          }

          event.preventDefault()
          return editor.dispatchCommand(INSERT_LINE_BREAK_COMMAND, false)
        },
        COMMAND_PRIORITY_EDITOR,
      ),
    )
  }, [editor, commit])

  return null
}

export function LexicalCommitPlugin() {
  const { dataScope } = useLexicalOverlayRuntime()
  if (dataScope) return <LexicalCommitPluginWithDataScope />
  return <LexicalCommitPluginSimple />
}
