import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  schemaVizDrawingsList,
  schemaVizGenerationTemplatesList,
  schemaVizModelsList,
} from '@/api/generated/schema-viz'
import { COMMAND_CENTER_QUERIES } from './commandCenterQueries'

vi.mock('@/api/generated/schema-viz', () => ({
  schemaVizDrawingsList: vi.fn(),
  schemaVizGenerationTemplatesList: vi.fn(),
  schemaVizModelsList: vi.fn(),
}))

const drawingsListMock = vi.mocked(schemaVizDrawingsList)
const templatesListMock = vi.mocked(schemaVizGenerationTemplatesList)
const modelsListMock = vi.mocked(schemaVizModelsList)

describe('command center queries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches generation templates for command search', async () => {
    templatesListMock.mockResolvedValue({
      data: [
        {
          id: '018f3b2e-8a9a-7c6d-9e0f-123456789abc',
          name: 'Network landscape',
          rootModel: 'network.Device',
          scope: 'owner',
          ownedByCurrentUser: true,
          featured: {
            enabled: false,
            rank: null,
          },
          shareSlug: null,
          draftVersion: null,
          publishedVersion: null,
          publishedAt: null,
          publishedBy: null,
          createdAt: '2026-06-17T10:00:00+00:00',
          updatedAt: '2026-06-17T10:00:00+00:00',
          revision: 1,
        },
      ],
      headers: new Headers(),
      status: 200,
    })

    await expect(
      COMMAND_CENTER_QUERIES.templates(true).queryFn(),
    ).resolves.toHaveLength(1)
    expect(templatesListMock).toHaveBeenCalledWith()
  })

  it('fetches drawings for command search', async () => {
    drawingsListMock.mockResolvedValue({
      data: [
        {
          id: '018f3b2e-8a9a-7c6d-9e0f-abcdefabcdef',
          title: 'Rack sketch',
          createdAt: '2026-06-17T10:00:00+00:00',
          updatedAt: '2026-06-17T10:00:00+00:00',
          revision: 1,
        },
      ],
      headers: new Headers(),
      status: 200,
    })

    await expect(
      COMMAND_CENTER_QUERIES.drawings(true).queryFn(),
    ).resolves.toHaveLength(1)
    expect(drawingsListMock).toHaveBeenCalledWith()
  })

  it('fetches Django models without framework models', async () => {
    modelsListMock.mockResolvedValue({
      data: [
        {
          appLabel: 'inventory',
          appVerboseName: 'Inventory',
          modelName: 'Device',
          verboseName: 'Device',
          verboseNamePlural: 'Devices',
          abstract: false,
          dbTable: 'inventory_device',
          managed: true,
          fields: [],
          relations: [],
          methods: [],
        },
      ],
      headers: new Headers(),
      status: 200,
    })

    await expect(
      COMMAND_CENTER_QUERIES.models(true).queryFn(),
    ).resolves.toHaveLength(1)
    expect(modelsListMock).toHaveBeenCalledWith({ excludeDjango: true })
  })
})
