import { useCallback, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

import type { GenerationTemplateRead } from '@/api/contracts'
import { createTemplateTextContent } from '@/features/lexical/templateTextContent'
import { getBuilderRecipeSnapshot } from '@/store/builderStore'
import type { WorkbenchTabId } from '@/store/workbenchStore'
import { BuilderHeader } from './components/BuilderHeader'
import { BuilderInspector } from './components/BuilderInspector'
import { BuilderPreviewPane } from './components/BuilderPreviewPane'
import type {
  BuilderPreviewCommit,
  BuilderPreviewResize,
} from './BuilderPreview'
import type { FlushInlineNodeEdit } from './BuilderInlineEditor'
import { BuilderStepsSidebar } from './components/BuilderStepsSidebar'
import { PublishRecipeDialog } from './modals/PublishRecipeDialog'
import type { PublishPayload } from './modals/PublishRecipeDialog'
import {
  markBuilderTemplateSaved,
  useBuilderDocumentView,
} from './builderWorkbench'
import { getModelIdFromBuilderGroupNodeId } from './builderPreviewLayout'
import {
  publishGenerationTemplate,
  saveGenerationTemplateDraft,
} from './generationTemplateMutations'
import { GENERATION_TEMPLATE_QUERIES } from './generationTemplateQueries'
import type { RecipeData, RecipeModel, RecipeStyleDraft } from './types'

type BuilderDocumentView = NonNullable<
  ReturnType<typeof useBuilderDocumentView>
>

type SaveBuilderTemplateInput = {
  recipe: RecipeData
  shareSlug?: string | null
}

type PublishBuilderTemplateInput = PublishPayload & {
  recipe: RecipeData
}

function getModelLabel(model: RecipeModel) {
  return model.alias || model.displayName
}

function createPreviewStyleDraft(
  model: RecipeModel,
  textContent: unknown,
): RecipeStyleDraft {
  const label = getModelLabel(model)
  return {
    sourceTemplateId: null,
    persistedTemplateId: null,
    name: `${label} node`,
    textContent,
    visualStyles: {},
    dimensions: {},
    typeSpecificData: {},
    dirty: true,
    saveState: 'idle',
  }
}

export function BuilderPage({
  tabId,
  template,
}: {
  tabId: WorkbenchTabId
  template?: GenerationTemplateRead | null
}) {
  const builder = useBuilderDocumentView(tabId)

  if (!builder) {
    return null
  }

  return <BuilderPageContent builder={builder} template={template ?? null} />
}

function BuilderPageContent({
  builder,
  template,
}: {
  builder: BuilderDocumentView
  template: GenerationTemplateRead | null
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [publishOpen, setPublishOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [savedTemplate, setSavedTemplate] = useState<{
    tabId: WorkbenchTabId
    template: GenerationTemplateRead
  } | null>(null)
  const [selectedCanvasNodeId, setSelectedCanvasNodeId] = useState<
    string | null
  >(null)
  const flushInlineNodeEditRef = useRef<FlushInlineNodeEdit | null>(null)

  const {
    actions,
    activeExampleId,
    activeStep,
    activeStepIndex,
    recipe,
    steps,
    tabId,
  } = builder
  const currentTemplate =
    savedTemplate?.tabId === tabId ? savedTemplate.template : template
  const currentTemplateId = currentTemplate?.id ?? null

  const handleRegisterFlushInlineEdit = useCallback(
    (flush: FlushInlineNodeEdit | null) => {
      flushInlineNodeEditRef.current = flush
    },
    [],
  )

  const getRecipeAfterPendingNodeEdit = useCallback(() => {
    flushInlineNodeEditRef.current?.()
    return getBuilderRecipeSnapshot(tabId)?.recipe ?? recipe
  }, [recipe, tabId])

  const handleSavedTemplate = useCallback(
    async (nextTemplate: GenerationTemplateRead) => {
      setSavedTemplate({ tabId, template: nextTemplate })
      markBuilderTemplateSaved(tabId, nextTemplate)
      // Sync recipe title if the backend changed it (e.g. name auto-increment)
      if (nextTemplate.name && nextTemplate.name !== recipe.title) {
        actions.setTitle(nextTemplate.name)
      }
      queryClient.setQueryData(
        GENERATION_TEMPLATE_QUERIES.detail(nextTemplate.id).queryKey,
        nextTemplate,
      )
      await navigate({
        to: '/builder',
        search: {
          templateId: nextTemplate.id,
        },
        replace: true,
      })
    },
    [actions, navigate, queryClient, recipe.title, tabId],
  )

  const saveMutation = useMutation({
    meta: { successMessage: 'Template saved' },
    mutationFn: ({ recipe: nextRecipe, shareSlug }: SaveBuilderTemplateInput) =>
      saveGenerationTemplateDraft({
        recipe: nextRecipe,
        shareSlug,
        template: currentTemplate,
        templateId: currentTemplateId,
      }),
    onSuccess: async ({ template: nextTemplate }) => {
      await queryClient.invalidateQueries({
        queryKey: ['home', 'quick-access'],
      })
      await handleSavedTemplate(nextTemplate)
    },
  })

  const publishMutation = useMutation({
    meta: { successMessage: 'Template published' },
    mutationFn: async (payload: PublishBuilderTemplateInput) => {
      const saved = await saveGenerationTemplateDraft({
        recipe: payload.recipe,
        shareSlug: payload.shareSlug,
        scope: payload.scope,
        template: currentTemplate,
        templateId: currentTemplateId,
      })
      return publishGenerationTemplate(saved.template.id)
    },
    onSuccess: async (nextTemplate) => {
      await queryClient.invalidateQueries({
        queryKey: ['home', 'quick-access'],
      })
      await handleSavedTemplate(nextTemplate)
    },
  })

  const saveError =
    saveMutation.error instanceof Error ? saveMutation.error.message : null
  const publishError =
    publishMutation.error instanceof Error
      ? publishMutation.error.message
      : null

  // Keep a ref to styleDrafts so the commit handler doesn't depend on it
  // (avoiding a rerender cascade: commit → draft changes → new callback → prop change)
  const styleDraftsRef = useRef(recipe.styleDrafts)
  styleDraftsRef.current = recipe.styleDrafts
  const modelsRef = useRef(recipe.models)
  modelsRef.current = recipe.models

  // Bridge canvas text commits back to the builder store's style drafts.
  // When a user edits node text inline and commits (blur/escape/cmd+enter),
  // we parse the committed lexicalJson back into a textContent update.
  const handleCommitNodeText = useCallback(
    (commit: BuilderPreviewCommit) => {
      console.log('[BuilderPage.handleCommitNodeText] ENTERED', {
        nodeId: commit.nodeId,
        lexicalJsonPreview: commit.lexicalJson.slice(0, 120),
        htmlPreview: commit.html.slice(0, 120),
      })
      const modelId =
        getModelIdFromBuilderGroupNodeId(commit.nodeId) ?? commit.nodeId
      const existingDraft = styleDraftsRef.current[modelId]
      const model = modelsRef.current.find(
        (candidate) => candidate.id === modelId,
      )
      if (!existingDraft && !model) {
        console.warn(
          '[BuilderPage.handleCommitNodeText] no draft, no model — bailing',
          { modelId },
        )
        return
      }

      // Parse lexicalJson back to the textContent format used by style drafts
      let textContent: unknown =
        existingDraft?.textContent ??
        (model ? createTemplateTextContent(getModelLabel(model)) : null)
      try {
        textContent = JSON.parse(commit.lexicalJson)
      } catch (error) {
        console.warn(
          '[BuilderPage.handleCommitNodeText] failed to parse lexicalJson',
          error,
        )
      }

      let nextDraft = existingDraft
      if (!nextDraft) {
        if (!model) return
        nextDraft = createPreviewStyleDraft(model, textContent)
      }

      console.log('[BuilderPage.handleCommitNodeText] calling setStyleDraft', {
        modelId,
      })
      actions.setStyleDraft(modelId, {
        ...nextDraft,
        textContent,
        dirty: true,
        saveState: 'idle',
        error: undefined,
      })
    },
    [actions],
  )

  // Bridge canvas resize-handle drags back to the builder store's style drafts.
  // When a user drags a Transformer handle the canvas updates node dimensions
  // internally; ResizeBridge detects the change and forwards it here so the
  // sidebar DimensionInputs stay in sync.
  const handleNodeResize = useCallback(
    (resize: BuilderPreviewResize) => {
      console.log('[BuilderPage.handleNodeResize] ENTERED', resize)
      console.trace('[BuilderPage.handleNodeResize] trace')
      const existingDraft = styleDraftsRef.current[resize.nodeId]
      const model = modelsRef.current.find(
        (candidate) => candidate.id === resize.nodeId,
      )
      if (!existingDraft && !model) return

      let nextDraft = existingDraft
      if (!nextDraft) {
        if (!model) return
        nextDraft = createPreviewStyleDraft(
          model,
          createTemplateTextContent(getModelLabel(model)),
        )
      }

      const currentDims = (nextDraft.dimensions ?? {}) as Record<
        string,
        unknown
      >
      console.log('[BuilderPage.handleNodeResize] calling setStyleDraft', {
        nodeId: resize.nodeId,
        width: resize.width,
        height: resize.height,
      })
      actions.setStyleDraft(resize.nodeId, {
        ...nextDraft,
        dimensions: {
          ...currentDims,
          width: resize.width,
          height: resize.height,
        },
        dirty: true,
        saveState: 'idle',
        error: undefined,
      })
    },
    [actions],
  )

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <BuilderHeader
        saveError={saveError}
        saving={saveMutation.isPending}
        title={recipe.title}
        onPublish={() => {
          flushInlineNodeEditRef.current?.()
          setPublishOpen(true)
        }}
        onSave={() =>
          saveMutation.mutate({
            recipe: getRecipeAfterPendingNodeEdit(),
            shareSlug: null,
          })
        }
        onShare={() => setExportOpen(true)}
        onTitleChange={actions.setTitle}
      />

      <div className="flex min-h-0 flex-1">
        <BuilderStepsSidebar
          activeStepIndex={activeStepIndex}
          onPickStep={actions.setActiveStep}
          steps={steps}
        />
        <BuilderPreviewPane
          actions={actions}
          activeExampleId={activeExampleId}
          activeStepKind={activeStep.kind}
          examples={recipe.examples}
          exportOpen={exportOpen}
          models={recipe.models}
          onCommitNodeText={handleCommitNodeText}
          onExportOpenChange={setExportOpen}
          onNodeResize={handleNodeResize}
          onNodeSelect={setSelectedCanvasNodeId}
          onRegisterFlushInlineEdit={handleRegisterFlushInlineEdit}
          onRenameLayer={actions.renameLayer}
          onSetLayerTextContent={actions.setLayerTextContent}
          recipe={recipe}
        />
        <BuilderInspector
          actions={actions}
          activeStep={activeStep}
          activeStepIndex={activeStepIndex}
          recipe={recipe}
          selectedCanvasNodeId={selectedCanvasNodeId}
          stepCount={steps.length}
        />
      </div>

      <PublishRecipeDialog
        open={publishOpen}
        publishError={publishError}
        publishing={publishMutation.isPending}
        recipe={recipe}
        template={currentTemplate}
        onOpenChange={setPublishOpen}
        onPublish={(payload) =>
          publishMutation.mutate({
            ...payload,
            recipe: getRecipeAfterPendingNodeEdit(),
          })
        }
      />
    </div>
  )
}
