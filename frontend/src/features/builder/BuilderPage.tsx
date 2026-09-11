import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

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
import { getRecipeStepStatuses } from './builderStepStatus'
import {
  importGenerationTemplate,
  publishGenerationTemplate,
  saveGenerationTemplateDraft,
} from './generationTemplateMutations'
import { GENERATION_TEMPLATE_QUERIES } from './generationTemplateQueries'
import {
  getGenerationTemplateFilename,
  parseGenerationTemplateFile,
  serializeGenerationTemplate,
} from './generationTemplateTransfer'
import { BUILDER_SESSION_QUERY } from './sessionQueries'
import { BUILDER_SCHEMA_QUERIES } from './schemaModelQueries'
import { recipeToGenerationTemplateWriteRequest } from './templateRecipe'
import type { RecipeData, RecipeModel, RecipeStyleDraft } from './types'

type BuilderDocumentView = NonNullable<
  ReturnType<typeof useBuilderDocumentView>
>

type SaveBuilderTemplateInput = {
  featured?: GenerationTemplateRead['featured']
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

function downloadTemplateFile(contents: string, filename: string) {
  const url = URL.createObjectURL(
    new Blob([contents], { type: 'application/json' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
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
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: sessionState } = useQuery(BUILDER_SESSION_QUERY)
  const [publishOpen, setPublishOpen] = useState(false)
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
  const stepStatuses = getRecipeStepStatuses(recipe, steps)
  const activeStepStatus = stepStatuses[activeStepIndex]!
  const canManageFeaturedTemplates =
    sessionState?.capabilities.canManageFeaturedTemplates ?? false

  function handleRegisterFlushInlineEdit(flush: FlushInlineNodeEdit | null) {
    flushInlineNodeEditRef.current = flush
  }

  function getRecipeAfterPendingNodeEdit() {
    flushInlineNodeEditRef.current?.()
    return getBuilderRecipeSnapshot(tabId) ?? recipe
  }

  async function handleSavedTemplate(nextTemplate: GenerationTemplateRead) {
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
  }

  const saveMutation = useMutation({
    meta: { successMessage: 'Template saved' },
    mutationFn: ({
      featured,
      recipe: nextRecipe,
      shareSlug,
    }: SaveBuilderTemplateInput) =>
      saveGenerationTemplateDraft({
        featured,
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
        featured: payload.featured,
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

  const importMutation = useMutation({
    meta: { successMessage: t('builder.header.importSuccess') },
    mutationFn: async (file: File) =>
      importGenerationTemplate(parseGenerationTemplateFile(await file.text())),
    onSuccess: async (nextTemplate) => {
      await queryClient.invalidateQueries({
        queryKey: ['home', 'quick-access'],
      })
      await handleSavedTemplate(nextTemplate)
    },
  })

  const exportMutation = useMutation({
    mutationFn: async (nextRecipe: RecipeData) => {
      const request = recipeToGenerationTemplateWriteRequest(nextRecipe, {
        scope: 'owner',
        shareSlug: null,
        template: currentTemplate,
      })
      if (!request) throw new Error(t('builder.header.exportNeedsModel'))

      const styleTemplates = (
        await Promise.all(
          nextRecipe.models.map((model) =>
            queryClient.fetchQuery(
              BUILDER_SCHEMA_QUERIES.styleTemplates(
                model.appLabel,
                model.modelName,
              ),
            ),
          ),
        )
      ).flat()
      downloadTemplateFile(
        serializeGenerationTemplate(request, styleTemplates),
        getGenerationTemplateFilename(request.name),
      )
    },
    onSuccess: () => toast.success(t('builder.header.exportSuccess')),
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : t('builder.header.exportError'),
      ),
  })

  const saveError =
    saveMutation.error instanceof Error ? saveMutation.error.message : null
  const publishError =
    publishMutation.error instanceof Error
      ? publishMutation.error.message
      : null

  // Keep a ref to styleDrafts so the commit handler doesn't depend on it
  // (avoiding a rerender cascade: commit -> draft changes -> new callback -> prop change)
  const styleDraftsRef = useRef(recipe.styleDrafts)
  const modelsRef = useRef(recipe.models)

  useEffect(() => {
    styleDraftsRef.current = recipe.styleDrafts
  }, [recipe.styleDrafts])

  useEffect(() => {
    modelsRef.current = recipe.models
  }, [recipe.models])

  // Bridge canvas text commits back to the builder store's style drafts.
  // When a user edits node text inline and commits (blur/escape/cmd+enter),
  // we parse the committed lexicalJson back into a textContent update.
  function handleCommitNodeText(commit: BuilderPreviewCommit) {
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
        '[BuilderPage.handleCommitNodeText] no draft, no model - bailing',
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
  }

  // Bridge canvas resize-handle drags back to the builder store's style drafts.
  // When a user drags a Transformer handle the canvas updates node dimensions
  // internally; ResizeBridge detects the change and forwards it here so the
  // sidebar DimensionInputs stay in sync.
  function handleNodeResize(resize: BuilderPreviewResize) {
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

    const currentDims = (nextDraft.dimensions ?? {}) as Record<string, unknown>
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
  }

  function handleExport() {
    exportMutation.mutate(getRecipeAfterPendingNodeEdit())
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <BuilderHeader
        exporting={exportMutation.isPending}
        importing={importMutation.isPending}
        saveError={saveError}
        saving={saveMutation.isPending}
        title={recipe.title}
        onExport={handleExport}
        onImport={(file) => importMutation.mutate(file)}
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
        onTitleChange={actions.setTitle}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <BuilderStepsSidebar
          activeStepIndex={activeStepIndex}
          onPickStep={actions.setActiveStep}
          statuses={stepStatuses}
          steps={steps}
        />
        <BuilderPreviewPane
          actions={actions}
          activeExampleId={activeExampleId}
          activeStepKind={activeStep.kind}
          examples={recipe.examples}
          models={recipe.models}
          onCommitNodeText={handleCommitNodeText}
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
          activeStepStatus={activeStepStatus}
          recipe={recipe}
          selectedCanvasNodeId={selectedCanvasNodeId}
          stepCount={steps.length}
        />
      </div>

      <PublishRecipeDialog
        key={
          publishOpen
            ? `publish-open-${currentTemplateId ?? 'new'}`
            : 'publish-closed'
        }
        canManageFeaturedTemplates={canManageFeaturedTemplates}
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
