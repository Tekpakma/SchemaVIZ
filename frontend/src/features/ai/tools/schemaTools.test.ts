import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  schemaVizGraphRetrieve,
  schemaVizModelsList,
} from '@/api/generated/schema-viz'
import type { AiToolContext } from './context'
import { getSchemaDigest, listModels } from './schemaTools'

vi.mock('@/api/generated/schema-viz', () => ({
  schemaVizGraphRetrieve: vi.fn(),
  schemaVizModelDetailsRetrieve: vi.fn(),
  schemaVizModelsList: vi.fn(),
}))

vi.mock('@/features/canvas/layout.server', () => ({
  getForwardedBackendHeaders: () => ({ authorization: 'Bearer test-token' }),
}))

const graphRetrieveMock = vi.mocked(schemaVizGraphRetrieve)
const modelsListMock = vi.mocked(schemaVizModelsList)

const context: AiToolContext = {
  auth: {
    kind: 'dev',
    user: { sub: 'tester', name: 'Tester' },
    accessToken: 'test-token',
  },
}

const toolContext = { context, emitCustomEvent: () => {} }

describe('schema tools', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('exposes models as dotted ids and forwards the caller identity', async () => {
    modelsListMock.mockResolvedValue({
      data: [
        {
          appLabel: 'infrastructure',
          appVerboseName: 'Infrastructure',
          modelName: 'CloudProvider',
          verboseName: 'Cloud provider',
          verboseNamePlural: 'Cloud providers',
          abstract: false,
          dbTable: 'infrastructure_cloudprovider',
          managed: true,
        },
      ],
      headers: new Headers(),
      status: 200,
    })

    await expect(listModels.execute!({}, toolContext)).resolves.toEqual({
      models: [
        {
          modelId: 'infrastructure.CloudProvider',
          appLabel: 'infrastructure',
          appName: 'Infrastructure',
          modelName: 'CloudProvider',
          verboseName: 'Cloud provider',
        },
      ],
    })

    expect(modelsListMock).toHaveBeenCalledWith(
      { appLabel: undefined, excludeDjango: true },
      { headers: { authorization: 'Bearer test-token' } },
    )
  })

  it('turns a failed response into an error instead of leaking the error body', async () => {
    modelsListMock.mockResolvedValue({
      data: { error: 'boom', details: 'stack' },
      headers: new Headers(),
      status: 500,
    })

    await expect(listModels.execute!({}, toolContext)).rejects.toThrow(
      'Failed to list models: 500',
    )
  })

  it('requests a field-free digest and classifies relationship kinds', async () => {
    graphRetrieveMock.mockResolvedValue({
      data: {
        schemaHash: 'abc',
        nodes: [
          {
            id: 'infrastructure.Server',
            name: 'Server',
            group: 'infrastructure',
            isProxy: false,
            isAbstract: false,
            primaryKey: 'id',
            appLabel: 'infrastructure',
            modelName: 'Server',
            fields: [],
          },
        ],
        edges: [
          {
            source: 'infrastructure.Service',
            target: 'infrastructure.Server',
            sourceField: 'server',
            isManyToMany: true,
          },
        ],
        groups: [],
      },
      headers: new Headers(),
      status: 200,
    })

    await expect(
      getSchemaDigest.execute!({ apps: ['infrastructure'] }, toolContext),
    ).resolves.toEqual({
      models: [
        {
          modelId: 'infrastructure.Server',
          label: 'Server',
          appLabel: 'infrastructure',
        },
      ],
      edges: [
        {
          from: 'infrastructure.Service',
          to: 'infrastructure.Server',
          viaField: 'server',
          kind: 'manyToMany',
        },
      ],
    })

    expect(graphRetrieveMock).toHaveBeenCalledWith(
      { includeFields: false, apps: 'infrastructure' },
      { headers: { authorization: 'Bearer test-token' } },
    )
  })
})
