import { beforeEach, describe, expect, it, vi } from 'vitest'

import { schemaVizModelsList } from '@/api/generated/schema-viz'

import type { AiToolContext } from '../tools'
import { dispatchMcpRequest } from './server'

vi.mock('@/api/generated/schema-viz', () => ({
  schemaVizGenerationRunsCreate: vi.fn(),
  schemaVizGenerationRunsValidateCreate: vi.fn(),
  schemaVizGraphRetrieve: vi.fn(),
  schemaVizModelDetailsRetrieve: vi.fn(),
  schemaVizModelsList: vi.fn(),
  schemaVizQueryRecordCreate: vi.fn(),
  schemaVizQueryRecordsCreate: vi.fn(),
}))

vi.mock('@/features/canvas/layout.server', () => ({
  getForwardedBackendHeaders: () => ({ authorization: 'Bearer test-token' }),
}))

const modelsListMock = vi.mocked(schemaVizModelsList)

const context: AiToolContext = {
  auth: {
    kind: 'browser',
    user: { sub: 'mcp-client', name: 'MCP client' },
    accessToken: 'test-token',
  },
}

describe('mcp dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('announces the protocol version and server identity', async () => {
    const response = await dispatchMcpRequest(
      { jsonrpc: '2.0', id: 1, method: 'initialize' },
      context,
    )

    expect(response).toMatchObject({
      id: 1,
      result: { serverInfo: { name: 'schema-viz' } },
    })
  })

  it('answers notifications with no body', async () => {
    await expect(
      dispatchMcpRequest(
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        context,
      ),
    ).resolves.toBeNull()
  })

  it('derives tool JSON Schema from the shared definitions', async () => {
    const response = (await dispatchMcpRequest(
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      context,
    )) as { result: { tools: Array<{ name: string; inputSchema: unknown }> } }

    const names = response.result.tools.map((tool) => tool.name)
    expect(names).toContain('listModels')
    expect(names).toContain('createDiagram')

    const listModels = response.result.tools.find(
      (tool) => tool.name === 'listModels',
    )
    expect(listModels!.inputSchema).toMatchObject({
      type: 'object',
      properties: { appLabel: { type: 'string' } },
    })
  })

  it('waits for a slow tool instead of racing a timeout', async () => {
    modelsListMock.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                data: [
                  {
                    appLabel: 'infrastructure',
                    appVerboseName: 'Infrastructure',
                    modelName: 'Server',
                    verboseName: 'Server',
                    verboseNamePlural: 'Servers',
                    abstract: false,
                    dbTable: 'infrastructure_server',
                    managed: true,
                  },
                ],
                headers: new Headers(),
                status: 200,
              }),
            50,
          ),
        ),
    )

    const response = (await dispatchMcpRequest(
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'listModels', arguments: {} },
      },
      context,
    )) as { result: { structuredContent: { models: Array<unknown> } } }

    expect(response.result.structuredContent.models).toHaveLength(1)
  })

  it('reports a tool failure as a result the model can react to', async () => {
    modelsListMock.mockResolvedValue({
      data: { error: 'boom', details: 'stack' },
      headers: new Headers(),
      status: 500,
    })

    const response = (await dispatchMcpRequest(
      {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: { name: 'listModels', arguments: {} },
      },
      context,
    )) as { result: { isError: boolean } }

    expect(response.result.isError).toBe(true)
  })

  it('rejects an unknown method with a protocol error', async () => {
    await expect(
      dispatchMcpRequest(
        { jsonrpc: '2.0', id: 5, method: 'resources/list' },
        context,
      ),
    ).resolves.toMatchObject({ error: { code: -32601 } })
  })
})
