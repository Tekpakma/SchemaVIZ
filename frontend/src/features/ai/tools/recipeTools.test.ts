import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  schemaVizGenerationRunsCreate,
  schemaVizGenerationRunsValidateCreate,
  schemaVizGenerationTemplatesCreate,
  schemaVizGenerationTemplatesPublishCreate,
  schemaVizGenerationTemplatesRetrieve,
  schemaVizGenerationTemplatesUpdate,
} from '@/api/generated/schema-viz'
import { recipeToInlineDefinition } from '@/features/builder/templateRecipe'

import type { AiToolContext } from './context'
import {
  createDiagram,
  publishDiagram,
  specToRecipe,
  validateDiagram,
} from './recipeTools'

vi.mock('@/api/generated/schema-viz', () => ({
  schemaVizGenerationRunsCreate: vi.fn(),
  schemaVizGenerationRunsValidateCreate: vi.fn(),
  schemaVizGenerationTemplatesCreate: vi.fn(),
  schemaVizGenerationTemplatesPublishCreate: vi.fn(),
  schemaVizGenerationTemplatesRetrieve: vi.fn(),
  schemaVizGenerationTemplatesUpdate: vi.fn(),
}))

vi.mock('@/features/canvas/layout.server', () => ({
  getForwardedBackendHeaders: () => ({ authorization: 'Bearer test-token' }),
}))

const validateMock = vi.mocked(schemaVizGenerationRunsValidateCreate)
const runMock = vi.mocked(schemaVizGenerationRunsCreate)
const templateCreateMock = vi.mocked(schemaVizGenerationTemplatesCreate)
const templateUpdateMock = vi.mocked(schemaVizGenerationTemplatesUpdate)
const templateRetrieveMock = vi.mocked(schemaVizGenerationTemplatesRetrieve)
const templatePublishMock = vi.mocked(schemaVizGenerationTemplatesPublishCreate)

type RunResponse = Awaited<ReturnType<typeof schemaVizGenerationRunsCreate>>

// The run response carries style and group templates the summary never reads.
function runResponse(
  mode: string,
  nodes: Array<unknown>,
  edges: Array<unknown> = [],
): RunResponse {
  return {
    data: { mode, result: { nodes, edges } },
    headers: new Headers(),
    status: 200,
  } as unknown as RunResponse
}

// Django answers template writes with the read serializer; the generated
// client types say otherwise, so responses are built loosely here as well.
function templateResponse(
  status: number,
  template: Record<string, unknown>,
): never {
  return {
    data: template,
    headers: new Headers(),
    status,
  } as unknown as never
}

const context: AiToolContext = {
  auth: {
    kind: 'dev',
    user: { sub: 'tester', name: 'Tester' },
    accessToken: 'test-token',
  },
  appOrigin: 'https://viz.example.test',
}
const toolContext = { context, emitCustomEvent: () => {} }

const spec = {
  title: 'Business group overview',
  rootModel: 'infrastructure.BusinessGroup',
  steps: [
    {
      fromModel: 'infrastructure.BusinessGroup',
      toModel: 'infrastructure.Application',
      relationship: 'applications',
    },
    {
      fromModel: 'infrastructure.Application',
      toModel: 'infrastructure.Server',
      relationship: 'servers',
    },
  ],
}

describe('diagram specs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps the root model first so it becomes the root step', () => {
    const recipe = specToRecipe(spec)

    expect(recipe.models.map((model) => model.modelId)).toEqual([
      'infrastructure.BusinessGroup',
      'infrastructure.Application',
      'infrastructure.Server',
    ])
    expect(recipe.title).toBe('Business group overview')
  })

  it('converts into a connected inline definition the backend accepts', () => {
    const source = recipeToInlineDefinition(specToRecipe(spec))

    expect(source).not.toBeNull()
    expect(source!.rootModel).toBe('infrastructure.BusinessGroup')
    expect(source!.inlineDefinition.rootStepId).toBe(
      'infrastructure.BusinessGroup',
    )

    const steps = source!.inlineDefinition.stepsById
    expect(steps['infrastructure.Application']).toMatchObject({
      parentId: 'infrastructure.BusinessGroup',
      relationship: 'applications',
      resolvedModelId: 'infrastructure.Application',
    })
    expect(steps['infrastructure.Server']).toMatchObject({
      parentId: 'infrastructure.Application',
      relationship: 'servers',
    })
    expect(steps['infrastructure.BusinessGroup']!.childIds).toContain(
      'infrastructure.Application',
    )
  })

  it('turns reference steps into leaf steps that reuse the drawn node', () => {
    const source = recipeToInlineDefinition(
      specToRecipe({
        ...spec,
        steps: [
          ...spec.steps,
          {
            fromModel: 'infrastructure.Server',
            toModel: 'infrastructure.Application',
            relationship: 'primary_application',
            groupMode: 'reference',
          },
        ],
      }),
    )

    const steps = source!.inlineDefinition.stepsById
    const reference = Object.values(steps).find(
      (step) => step.groupMode === 'reference',
    )
    expect(reference).toMatchObject({
      parentId: 'infrastructure.Server',
      relationship: 'primary_application',
      resolvedModelId: 'infrastructure.Application',
      visibility: 'visible',
    })
    expect(steps['infrastructure.Server']!.childIds).toContain(reference!.id)
    // The referenced model keeps its own step untouched.
    expect(steps['infrastructure.Application']).toMatchObject({
      parentId: 'infrastructure.BusinessGroup',
      relationship: 'applications',
      groupMode: 'none',
    })
  })

  it('reports an unusable specification without calling the backend', async () => {
    await expect(
      validateDiagram.execute!(
        { spec: { title: 'Empty', rootModel: 'not-a-model-id', steps: [] } },
        toolContext,
      ),
    ).resolves.toMatchObject({ valid: false })

    expect(validateMock).not.toHaveBeenCalled()
  })

  it('passes backend issues straight through so the model can act on them', async () => {
    validateMock.mockResolvedValue({
      data: {
        valid: false,
        errors: [
          {
            code: 'unknown_relationship',
            message: 'servers is not a relationship',
            stepId: 'infrastructure.Server',
            hint: 'Call getModelDetails for the exact name.',
          },
        ],
        warnings: [],
      },
      headers: new Headers(),
      status: 200,
    })

    await expect(
      validateDiagram.execute!({ spec }, toolContext),
    ).resolves.toMatchObject({
      valid: false,
      errors: [{ stepId: 'infrastructure.Server' }],
    })

    expect(validateMock).toHaveBeenCalledWith(
      expect.objectContaining({ rootModel: 'infrastructure.BusinessGroup' }),
      expect.objectContaining({
        headers: { authorization: 'Bearer test-token' },
      }),
    )
  })

  it('summarises a run instead of returning the whole graph', async () => {
    runMock.mockResolvedValue(
      runResponse(
        'live',
        Array.from({ length: 40 }, (_, index) => ({
          id: `node-${index}`,
          appLabel: 'infrastructure',
          modelName: index % 2 === 0 ? 'Server' : 'Application',
          recordPk: String(index),
          label: `Node ${index}`,
          displayName: `Node ${index}`,
          fields: {},
          styleTemplateId: null,
        })),
      ),
    )

    const result = await createDiagram.execute!(
      { spec, recordId: '42' },
      toolContext,
    )

    expect(result).toMatchObject({
      mode: 'live',
      nodeCount: 40,
      modelsIncluded: ['infrastructure.Server', 'infrastructure.Application'],
    })
    expect(result.sampleLabels).toHaveLength(10)
    expect(result.graph).toBeUndefined()

    expect(runMock).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'live', recordId: '42' }),
      expect.objectContaining({
        headers: { authorization: 'Bearer test-token' },
      }),
    )
  })

  it('hands over a drawable graph without field blobs when asked', async () => {
    runMock.mockResolvedValue(
      runResponse(
        'live',
        [
          {
            id: 'bg-1',
            appLabel: 'infrastructure',
            modelName: 'BusinessGroup',
            recordPk: '1',
            label: 'Business group',
            displayName: 'Retail',
            fields: { secret: 'never returned' },
            styleTemplateId: null,
          },
          {
            id: 'app-7',
            appLabel: 'infrastructure',
            modelName: 'Application',
            recordPk: '7',
            label: null,
            displayName: 'Shop',
            fields: {},
            styleTemplateId: null,
            parentId: 'bg-1',
          },
        ],
        [{ source: 'bg-1', target: 'app-7', relationship: 'applications' }],
      ),
    )

    const result = await createDiagram.execute!(
      { spec, recordId: '1', includeGraph: true },
      toolContext,
    )

    expect(result.edgeCount).toBe(1)
    expect(result.graph).toEqual({
      nodes: [
        {
          id: 'bg-1',
          model: 'infrastructure.BusinessGroup',
          recordId: '1',
          label: 'Retail',
          parentId: null,
          isGroup: false,
        },
        {
          id: 'app-7',
          model: 'infrastructure.Application',
          recordId: '7',
          label: 'Shop',
          parentId: 'bg-1',
          isGroup: false,
        },
      ],
      edges: [
        { source: 'bg-1', target: 'app-7', relationship: 'applications' },
      ],
    })
  })

  it('runs without a record as a structure preview', async () => {
    runMock.mockResolvedValue(runResponse('structure', []))

    await createDiagram.execute!({ spec }, toolContext)

    expect(runMock).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'structure', recordId: null }),
      expect.anything(),
    )
  })
})

describe('publishDiagram', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates, publishes and links a new template with a unique slug', async () => {
    templateCreateMock.mockImplementation(async (request) =>
      templateResponse(201, {
        id: 'tpl-1',
        shareSlug: request.shareSlug,
      }),
    )
    templatePublishMock.mockResolvedValue(
      templateResponse(200, {
        id: 'tpl-1',
        shareSlug: 'business-group-overview-abc123',
      }),
    )

    const result = await publishDiagram.execute!(
      { spec, recordId: '42' },
      toolContext,
    )

    const request = templateCreateMock.mock.calls[0]![0]
    expect(request.name).toBe('Business group overview')
    expect(request.rootModel).toBe('infrastructure.BusinessGroup')
    expect(request.shareSlug).toMatch(/^business-group-overview-[a-z0-9]{6}$/)
    expect(templateCreateMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        headers: { authorization: 'Bearer test-token' },
      }),
    )
    expect(templatePublishMock).toHaveBeenCalledWith(
      'tpl-1',
      expect.objectContaining({
        headers: { authorization: 'Bearer test-token' },
      }),
    )

    expect(result).toEqual({
      templateId: 'tpl-1',
      shareSlug: 'business-group-overview-abc123',
      builderUrl: 'https://viz.example.test/builder?templateId=tpl-1',
      pickerUrl:
        'https://viz.example.test/generate/business-group-overview-abc123/',
      diagramUrl:
        'https://viz.example.test/generate/business-group-overview-abc123/42',
      embedUrl:
        'https://viz.example.test/generate/business-group-overview-abc123/42?embed=1',
    })
  })

  it('updates an existing template while keeping its slug', async () => {
    templateRetrieveMock.mockResolvedValue(
      templateResponse(200, {
        id: 'tpl-1',
        shareSlug: 'kept-slug',
        description: 'Existing',
        scope: 'owner',
      }),
    )
    templateUpdateMock.mockResolvedValue(
      templateResponse(200, { id: 'tpl-1', shareSlug: 'kept-slug' }),
    )
    templatePublishMock.mockResolvedValue(
      templateResponse(200, { id: 'tpl-1', shareSlug: 'kept-slug' }),
    )

    const result = await publishDiagram.execute!(
      { spec, templateId: 'tpl-1' },
      toolContext,
    )

    expect(templateCreateMock).not.toHaveBeenCalled()
    expect(templateUpdateMock).toHaveBeenCalledWith(
      'tpl-1',
      expect.objectContaining({
        shareSlug: 'kept-slug',
        description: 'Existing',
      }),
      expect.anything(),
    )
    expect(result).toMatchObject({
      shareSlug: 'kept-slug',
      diagramUrl: null,
      embedUrl: null,
    })
  })

  it('falls back to relative links without a known app origin', async () => {
    templateCreateMock.mockResolvedValue(
      templateResponse(201, { id: 'tpl-2', shareSlug: 'x' }),
    )
    templatePublishMock.mockResolvedValue(
      templateResponse(200, { id: 'tpl-2', shareSlug: 'x' }),
    )

    const result = await publishDiagram.execute!(
      { spec },
      { ...toolContext, context: { auth: context.auth } },
    )

    expect(result.pickerUrl).toBe('/generate/x/')
  })

  it('surfaces backend validation errors so the model can fix the spec', async () => {
    templateCreateMock.mockResolvedValue(
      templateResponse(400, { name: ['Dieser Name ist bereits vergeben.'] }),
    )

    await expect(
      publishDiagram.execute!({ spec }, toolContext),
    ).rejects.toThrow(/bereits vergeben/)
    expect(templatePublishMock).not.toHaveBeenCalled()
  })
})
