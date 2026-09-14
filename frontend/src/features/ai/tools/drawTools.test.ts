import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  schemaVizGenerationRunsCreate,
  schemaVizGenerationRunsValidateCreate,
  schemaVizGenerationTemplatesCreate,
  schemaVizGenerationTemplatesPublishCreate,
  schemaVizGraphRetrieve,
  schemaVizQueryRecordCreate,
  schemaVizQueryRecordsCreate,
} from '@/api/generated/schema-viz'

import type { AiToolContext } from './context'
import { drawDiagram } from './drawTools'
import { renderGenerationSvg } from '../preview/renderGenerationSvg.server'

vi.mock('@/api/generated/schema-viz', () => ({
  schemaVizGenerationRunsCreate: vi.fn(),
  schemaVizGenerationRunsValidateCreate: vi.fn(),
  schemaVizGenerationTemplatesCreate: vi.fn(),
  schemaVizGenerationTemplatesPublishCreate: vi.fn(),
  schemaVizGraphRetrieve: vi.fn(),
  schemaVizQueryRecordCreate: vi.fn(),
  schemaVizQueryRecordsCreate: vi.fn(),
}))

vi.mock('@/features/canvas/layout.server', () => ({
  getForwardedBackendHeaders: () => ({ authorization: 'Bearer test-token' }),
}))

vi.mock('../preview/renderGenerationSvg.server', () => ({
  renderGenerationSvg: vi.fn(),
}))

const renderMock = vi.mocked(renderGenerationSvg)

const graphMock = vi.mocked(schemaVizGraphRetrieve)
const validateMock = vi.mocked(schemaVizGenerationRunsValidateCreate)
const runMock = vi.mocked(schemaVizGenerationRunsCreate)
const recordsMock = vi.mocked(schemaVizQueryRecordsCreate)
const recordMock = vi.mocked(schemaVizQueryRecordCreate)
const createMock = vi.mocked(schemaVizGenerationTemplatesCreate)
const publishMock = vi.mocked(schemaVizGenerationTemplatesPublishCreate)

// Responses are shaped loosely: the generated types are narrower than what
// Django really answers, and only the fields the tool reads matter here.
function ok(data: unknown, status = 200): never {
  return { data, headers: new Headers(), status } as never
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

const graph = {
  schemaHash: 'x',
  groups: [],
  nodes: [
    { id: 'infrastructure.BusinessGroup', name: 'BusinessGroup' },
    { id: 'infrastructure.Application', name: 'Application' },
  ],
  edges: [
    {
      source: 'infrastructure.Application',
      target: 'infrastructure.BusinessGroup',
      sourceField: 'business_group',
      reverseName: 'applications',
      isForeignKey: true,
    },
  ],
}

function recordPage(labels: Array<[string, string]>): never {
  return ok({
    count: labels.length,
    results: labels.map(([id, displayName]) => ({
      displayName,
      fields: { id },
    })),
  })
}

function templateRead(overrides: Record<string, unknown>) {
  return {
    id: 'tpl-1',
    name: 'BusinessGroup landscape',
    shareSlug: null,
    ...overrides,
  }
}

describe('drawDiagram', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    graphMock.mockResolvedValue(ok(graph))
    validateMock.mockResolvedValue(
      ok({ valid: true, errors: [], warnings: [] }),
    )
    runMock.mockResolvedValue(
      ok({
        mode: 'live',
        result: {
          nodes: [
            {
              id: 'n1',
              appLabel: 'infrastructure',
              modelName: 'BusinessGroup',
              recordPk: '2',
              label: null,
              displayName: 'Engineering',
              fields: {},
              styleTemplateId: null,
            },
          ],
          edges: [],
        },
      }),
    )
    createMock.mockResolvedValue(ok(templateRead({}), 201))
    publishMock.mockResolvedValue(
      ok(templateRead({ shareSlug: 'businessgroup-landscape-abc123' })),
    )
    renderMock.mockResolvedValue('<svg xmlns="http://www.w3.org/2000/svg"/>')
  })

  it('asks instead of guessing when several records match', async () => {
    recordsMock.mockResolvedValue(
      recordPage([
        ['3', 'draw-demo-group-0000'],
        ['4', 'draw-demo-group-0001'],
      ]),
    )

    const result = await drawDiagram.execute!(
      { rootModel: 'infrastructure.businessgroup', record: 'draw-demo' },
      toolContext,
    )

    expect(result.status).toBe('needs_input')
    expect(result.candidates).toEqual([
      { recordId: '3', label: 'draw-demo-group-0000' },
      { recordId: '4', label: 'draw-demo-group-0001' },
    ])
    expect(result.spec?.rootModel).toBe('infrastructure.BusinessGroup')
    expect(createMock).not.toHaveBeenCalled()
  })

  it('prefers an exact label match over the fuzzy hits', async () => {
    recordsMock.mockResolvedValue(
      recordPage([
        ['2', 'Engineering'],
        ['9', 'Engineering Sandbox'],
      ]),
    )

    const result = await drawDiagram.execute!(
      {
        rootModel: 'infrastructure.BusinessGroup',
        record: 'engineering',
        intent: 'Landschaft der BG Engineering',
      },
      toolContext,
    )

    expect(result.status).toBe('ok')
    expect(result.record).toEqual({ recordId: '2', label: 'Engineering' })
    expect(result.published).toBe(false)
    expect(result.diagramUrl).toBeNull()
    expect(result.builderUrl).toBe(
      'https://viz.example.test/builder?templateId=tpl-1',
    )
    expect(result.preview).toEqual({
      nodeCount: 1,
      edgeCount: 0,
      sampleLabels: ['Engineering'],
    })
    expect(result.previewSvg).toContain('<svg')
    expect(renderMock).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'live' }),
      expect.objectContaining({
        title: 'BusinessGroup landscape',
        examples: [expect.objectContaining({ idValue: 'infrastructure:2' })],
      }),
      expect.anything(),
    )

    // The draft carries the record as default example plus provenance.
    const request = createMock.mock.calls[0]![0]
    expect(request.shareSlug).toBeUndefined()
    expect(request.description).toContain('Landschaft der BG Engineering')
    const settings = request.layoutSettings as Record<string, unknown>
    expect(settings.examples).toEqual([
      expect.objectContaining({
        idValue: 'infrastructure:2',
        label: 'Engineering',
        isDefault: true,
      }),
    ])
    expect(settings.provenance).toMatchObject({
      source: 'mcp',
      intent: 'Landschaft der BG Engineering',
      options: {
        rootModel: 'infrastructure.BusinessGroup',
        record: 'engineering',
      },
    })
    expect(publishMock).not.toHaveBeenCalled()
  })

  it('takes a bare id directly and publishes on request', async () => {
    recordMock.mockResolvedValue(ok({ displayName: 'Engineering', fields: {} }))

    const result = await drawDiagram.execute!(
      { rootModel: 'infrastructure.BusinessGroup', record: '2', publish: true },
      toolContext,
    )

    expect(recordsMock).not.toHaveBeenCalled()
    expect(result.status).toBe('ok')
    expect(result.published).toBe(true)
    expect(createMock.mock.calls[0]![0].shareSlug).toMatch(
      /^businessgroup-landscape-[a-z0-9]{6}$/,
    )
    expect(publishMock).toHaveBeenCalledWith('tpl-1', expect.anything())
    expect(result.diagramUrl).toBe(
      'https://viz.example.test/generate/businessgroup-landscape-abc123/2',
    )
    expect(result.pickerUrl).toBe(
      'https://viz.example.test/generate/businessgroup-landscape-abc123/',
    )
  })

  it('retries with a numbered title when the name is taken', async () => {
    createMock
      .mockResolvedValueOnce(ok({ name: ['Name already in use.'] }, 400))
      .mockResolvedValueOnce(
        ok(templateRead({ name: 'BusinessGroup landscape (2)' }), 201),
      )

    const result = await drawDiagram.execute!(
      { rootModel: 'infrastructure.BusinessGroup' },
      toolContext,
    )

    expect(createMock).toHaveBeenCalledTimes(2)
    expect(createMock.mock.calls[1]![0].name).toBe(
      'BusinessGroup landscape (2)',
    )
    expect(result.title).toBe('BusinessGroup landscape (2)')
    expect(result.record).toBeNull()
    expect(runMock).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'structure', recordId: null }),
      expect.anything(),
    )
  })

  it('stops at validation errors without touching the database', async () => {
    validateMock.mockResolvedValue(
      ok({
        valid: false,
        errors: [
          {
            code: 'unknown_relationship',
            message: 'nope',
            stepId: 'infrastructure.Application',
            hint: 'Check getModelDetails.',
          },
        ],
        warnings: [],
      }),
    )

    const result = await drawDiagram.execute!(
      {
        rootModel: 'infrastructure.BusinessGroup',
        spec: {
          title: 'Custom',
          rootModel: 'infrastructure.BusinessGroup',
          steps: [
            {
              fromModel: 'infrastructure.BusinessGroup',
              toModel: 'infrastructure.Application',
              relationship: 'nope',
            },
          ],
        },
      },
      toolContext,
    )

    expect(result.status).toBe('invalid')
    expect(result.errors).toHaveLength(1)
    expect(graphMock).not.toHaveBeenCalled()
    expect(runMock).not.toHaveBeenCalled()
    expect(createMock).not.toHaveBeenCalled()
  })

  it('keeps the saved draft when the preview render fails or is declined', async () => {
    renderMock.mockRejectedValueOnce(new Error('ELK exploded'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const failed = await drawDiagram.execute!(
      { rootModel: 'infrastructure.BusinessGroup' },
      toolContext,
    )
    expect(failed.status).toBe('ok')
    expect(failed.previewSvg).toBeUndefined()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()

    renderMock.mockClear()
    const declined = await drawDiagram.execute!(
      { rootModel: 'infrastructure.BusinessGroup', includePreview: false },
      toolContext,
    )
    expect(declined.previewSvg).toBeUndefined()
    expect(renderMock).not.toHaveBeenCalled()
  })
})
