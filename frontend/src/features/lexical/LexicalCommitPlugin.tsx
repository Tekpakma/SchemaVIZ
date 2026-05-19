import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useQueryClient, useSuspenseQueries } from '@tanstack/react-query'
import { layout } from 'render-tag'
import {
  BLUR_COMMAND,
  COMMAND_PRIORITY_EDITOR,
  COMMAND_PRIORITY_HIGH,
  FOCUS_COMMAND,
  INSERT_LINE_BREAK_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
} from 'lexical'
import { mergeRegister } from '@lexical/utils'

// BLUR_COMMAND is deferred by this many ms so transient blurs (notably
// React StrictMode's dev-mode mount → unmount → remount cycle, which
// briefly steals focus) can be cancelled by a follow-up FOCUS_COMMAND or
// by component cleanup. Real user blurs (clicking outside) survive
// the wait and commit normally.
const BLUR_COMMIT_SETTLE_MS = 100

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

  // Persist editor text into the canvas store. Does NOT call stopEditing —
  // callers decide whether to exit edit mode after committing.
  const commitText = useCallback(async () => {
    if (didCommitRef.current || !nodeWidth) return
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
  }, [
    editor,
    queryClient,
    rootRef,
    nodeId,
    nodeWidth,
    dataScope,
    commitNodeText,
    recordData,
    modelDetails,
  ])

  // User-driven "I'm done editing" — commits text AND exits edit mode.
  const commitAndExit = useCallback(async () => {
    await commitText()
    stopEditing()
    return true
  }, [commitText, stopEditing])

  // `commitText` is intentionally referenced via `commitAndExit` below;
  // keeping it as a named callback documents the split between
  // "save text" and "save + exit" so future maintainers don't
  // collapse them back into one function and reintroduce the
  // unmount-time stopEditing bug.
  void commitText
  return useLexicalCommitCommands(editor, commitAndExit)
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

  // Persist editor text into the canvas store. Does NOT call stopEditing.
  const commitText = useCallback(async () => {
    if (didCommitRef.current || !nodeWidth) return
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
  }, [editor, nodeId, nodeWidth, commitNodeText])

  // User-driven "I'm done editing".
  const commitAndExit = useCallback(async () => {
    await commitText()
    stopEditing()
    return true
  }, [commitText, stopEditing])

  // `commitText` is intentionally referenced via `commitAndExit` below;
  // keeping it as a named callback documents the split between
  // "save text" and "save + exit" so future maintainers don't
  // collapse them back into one function and reintroduce the
  // unmount-time stopEditing bug.
  void commitText
  return useLexicalCommitCommands(editor, commitAndExit)
}

function useLexicalCommitCommands(
  editor: ReturnType<typeof useLexicalComposerContext>[0],
  commitAndExit: () => Promise<boolean>,
) {
  // Pending blur-commit timer (see BLUR_COMMIT_SETTLE_MS). Held in a ref
  // so FOCUS_COMMAND and cleanup can cancel it before it fires.
  const pendingBlurCommitRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )

  useEffect(() => {
    const cancelPendingBlurCommit = () => {
      if (pendingBlurCommitRef.current !== null) {
        clearTimeout(pendingBlurCommitRef.current)
        pendingBlurCommitRef.current = null
      }
    }

    const unregister = mergeRegister(
      editor.registerCommand(
        BLUR_COMMAND,
        () => {
          // Defer the commit so a follow-up FOCUS_COMMAND (real user
          // re-focus) or a component cleanup (StrictMode / unmount) can
          // cancel it. Without this delay, a blur fired during React
          // StrictMode's dev-mode throwaway-mount cycle would call
          // commitAndExit → stopEditing and kill the editor before the
          // user could type.
          cancelPendingBlurCommit()
          pendingBlurCommitRef.current = setTimeout(() => {
            pendingBlurCommitRef.current = null
            void commitAndExit()
          }, BLUR_COMMIT_SETTLE_MS)
          return true
        },
        COMMAND_PRIORITY_EDITOR,
      ),
      editor.registerCommand(
        FOCUS_COMMAND,
        () => {
          // Focus returned — cancel any pending blur-commit.
          cancelPendingBlurCommit()
          return false
        },
        COMMAND_PRIORITY_EDITOR,
      ),
      editor.registerCommand(
        KEY_ESCAPE_COMMAND,
        (event) => {
          event.preventDefault()
          cancelPendingBlurCommit()
          void commitAndExit()
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
            cancelPendingBlurCommit()
            void commitAndExit()
            return true
          }

          event.preventDefault()
          return editor.dispatchCommand(INSERT_LINE_BREAK_COMMAND, false)
        },
        COMMAND_PRIORITY_EDITOR,
      ),
    )

    return () => {
      // Cleanup. Crucially, we cancel any pending blur-commit instead
      // of running it: if cleanup fires because the editor is going
      // away (real unmount), the commit is moot; if it fires because
      // of React StrictMode's throwaway cycle (dev), running the commit
      // would clear editingNodeId and kill the editor.
      cancelPendingBlurCommit()
      unregister()
    }
  }, [editor, commitAndExit])

  return null
}

export function LexicalCommitPlugin() {
  const { dataScope } = useLexicalOverlayRuntime()
  // Only use the data-scope variant when a recordId is available.
  // Without a record we can't resolve field values — e.g. builder preview
  // nodes have appLabel/modelName for autocomplete but no actual record.
  if (dataScope?.recordId) return <LexicalCommitPluginWithDataScope />
  return <LexicalCommitPluginSimple />
}
