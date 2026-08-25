import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  schemaVizGenerationRunsCreate,
  schemaVizGenerationRunsValidateCreate,
} from '@/api/generated/schema-viz'
import { recipeToInlineDefinition } from '@/features/builder/templateRecipe'

import type { AiToolContext } from './context'
import { createDiagram, specToRecipe, validateDiagram } from './recipeTools'

vi.mock('@/api/generated/schema-viz', () => ({
  schemaVizGenerationRunsCreate: vi.fn(),
  schemaVizGenerationRunsValidateCreate: vi.fn(),
}))

vi.mock('@/features/canvas/layout.server', () => ({
  getForwardedBackendHeaders: () => ({ authorization: 'Bearer test-token' }),
}))

const validateMock = vi.mocked(schemaVizGenerationRunsValidateCreate)
const runMock = vi.mocked(schemaVizGenerationRunsCreate)

type RunResponse = Awaited<ReturnType<typeof schemaVizGenerationRunsCreate>>

// The run response carries style and group templates the summary never reads.
function runResponse(mode: string, nodes: Array<unknown>): RunResponse {
  return {
    data: { mode, result: { nodes } },
    headers: new Headers(),
    status: 200,
  } as unknown as RunResponse
}

const context: AiToolContext = {
  auth: {
    kind: 'dev',
    user: { sub: 'tester', name: 'Tester' },
    accessToken: 'test-token',
  },
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
      { headers: { authorization: 'Bearer test-token' } },
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

    expect(runMock).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'live', recordId: '42' }),
      { headers: { authorization: 'Bearer test-token' } },
    )
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
