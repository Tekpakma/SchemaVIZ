import { describe, expect, it } from 'vitest'

import type { GenerationTemplateWriteRequest } from '@/api/contracts'
import {
  GenerationTemplateTransferError,
  getGenerationTemplateFilename,
  parseGenerationTemplateFile,
  serializeGenerationTemplate,
} from './generationTemplateTransfer'

const request = {
  name: 'Service map',
  description: 'Production services',
  rootModel: 'infrastructure.Service',
  scope: 'global',
  featured: { enabled: true, rank: 2 },
  shareSlug: 'service-map',
  definition: {
    rootStepId: 'service',
    stepsById: {
      service: {
        id: 'service',
        resolvedModelId: 'infrastructure.Service',
        visibility: 'visible',
        groupMode: 'none',
      },
    },
  },
  layoutSettings: {
    layoutAlgorithm: 'Layered',
    edges: [{ id: 'persisted-edge' }],
  },
} as GenerationTemplateWriteRequest

describe('generation template transfer', () => {
  it('round-trips portable fields and imports as an owner draft', () => {
    const serialized = serializeGenerationTemplate(request)
    const imported = parseGenerationTemplateFile(serialized)

    expect(imported).toEqual({
      name: 'Service map',
      description: 'Production services',
      rootModel: 'infrastructure.Service',
      scope: 'owner',
      featured: { enabled: false, rank: null },
      definition: request.definition,
      layoutSettings: request.layoutSettings,
    })
    expect(serialized).not.toContain('service-map')
  })

  it('rejects malformed and unrelated JSON files', () => {
    expect(() => parseGenerationTemplateFile('{')).toThrow(
      GenerationTemplateTransferError,
    )
    expect(() => parseGenerationTemplateFile('{}')).toThrow(
      'not a supported SchemaVIZ template',
    )
  })

  it('creates a portable filename', () => {
    expect(getGenerationTemplateFilename('  Service Map 2026! ')).toBe(
      'service-map-2026.schemaviz-template.json',
    )
  })

  it('embeds referenced style templates instead of exporting their ids', () => {
    const requestWithStyle = {
      ...request,
      definition: {
        ...request.definition,
        stepsById: {
          service: {
            ...request.definition.stepsById.service,
            styleTemplateId: '85afc0fb-585a-4c96-9ebd-98b0cc8db171',
          },
        },
      },
    }
    const serialized = serializeGenerationTemplate(requestWithStyle, [
      {
        id: '85afc0fb-585a-4c96-9ebd-98b0cc8db171',
        name: 'Service node',
        textContent: { type: 'root' },
        visualStyles: { backgroundColor: '#ffffff' },
        dimensions: { width: 240 },
        typeSpecificData: { shapeKey: 'rectangle' },
        targetModelStatus: 'valid',
        createdAt: '2026-09-11T09:00:00Z',
        updatedAt: '2026-09-11T09:00:00Z',
        revision: 1,
      },
    ])

    const imported = parseGenerationTemplateFile(serialized)
    expect(imported.definition.stepsById.service?.styleTemplateId).toBeNull()
    expect(imported.layoutSettings).toMatchObject({
      styleDrafts: {
        service: {
          name: 'Service node',
          sourceTemplateId: null,
          visualStyles: { backgroundColor: '#ffffff' },
        },
      },
    })
    expect(serialized).not.toContain('85afc0fb-585a-4c96-9ebd-98b0cc8db171')
  })
})
