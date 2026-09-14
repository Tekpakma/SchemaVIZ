import type { AnyServerTool } from '@tanstack/ai'
import {
  convertSchemaToJsonSchema,
  parseWithStandardSchema,
} from '@tanstack/ai'

import type { AiToolContext } from '../tools'
import { serverTools } from '../tools'

// The registry is intentionally precisely typed for chat(); MCP dispatches
// across all tools at once and only needs the common shape.
const tools = serverTools as Array<AnyServerTool>

const PROTOCOL_VERSION = '2025-06-18'

export const MCP_SERVER_INFO = {
  name: 'schema-viz',
  version: '1.0.0',
} as const

type JsonRpcId = string | number | null

type JsonRpcRequest = {
  jsonrpc: '2.0'
  id?: JsonRpcId
  method: string
  params?: Record<string, unknown>
}

function result(id: JsonRpcId, value: unknown) {
  return { jsonrpc: '2.0' as const, id, result: value }
}

function failure(id: JsonRpcId, code: number, message: string) {
  return { jsonrpc: '2.0' as const, id, error: { code, message } }
}

function describeTools() {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: convertSchemaToJsonSchema(tool.inputSchema) ?? {
      type: 'object',
    },
  }))
}

async function callTool(
  name: unknown,
  args: unknown,
  context: AiToolContext,
): Promise<unknown> {
  const tool = tools.find((candidate) => candidate.name === name)
  if (!tool?.execute) {
    throw new Error(`Unknown tool: ${String(name)}`)
  }

  const input = tool.inputSchema
    ? parseWithStandardSchema(tool.inputSchema, args ?? {})
    : args
  const output = await tool.execute(input, {
    context,
    emitCustomEvent: () => {},
  })

  // A rendered preview is an image for the client, not text for the model:
  // it leaves the JSON and becomes a separate content block.
  const { previewSvg, rest } = splitPreview(output)
  const content: Array<Record<string, unknown>> = [
    { type: 'text', text: JSON.stringify(rest, null, 2) },
  ]
  if (previewSvg) {
    content.push({
      type: 'image',
      data: Buffer.from(previewSvg, 'utf8').toString('base64'),
      mimeType: 'image/svg+xml',
    })
  }

  // MCP clients render content blocks; structuredContent carries the typed form.
  return { content, structuredContent: rest }
}

export function splitPreview(output: unknown): {
  previewSvg: string | null
  rest: unknown
} {
  if (
    output &&
    typeof output === 'object' &&
    'previewSvg' in output &&
    typeof output.previewSvg === 'string'
  ) {
    const { previewSvg, ...rest } = output
    return { previewSvg, rest }
  }
  return { previewSvg: null, rest: output }
}

/**
 * Stateless JSON-RPC dispatch. Each request carries its own auth context, so
 * there is no server instance or session to keep between calls.
 */
export async function dispatchMcpRequest(
  message: JsonRpcRequest,
  context: AiToolContext,
) {
  const id = message.id ?? null

  switch (message.method) {
    case 'initialize':
      return result(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: MCP_SERVER_INFO,
      })

    case 'notifications/initialized':
      return null

    case 'ping':
      return result(id, {})

    case 'tools/list':
      return result(id, { tools: describeTools() })

    case 'tools/call':
      try {
        return result(
          id,
          await callTool(
            message.params?.name,
            message.params?.arguments,
            context,
          ),
        )
      } catch (error) {
        // Tool failures are results, not protocol errors: the model should see
        // the message and get a chance to correct its own call.
        return result(id, {
          content: [
            {
              type: 'text',
              text: error instanceof Error ? error.message : String(error),
            },
          ],
          isError: true,
        })
      }

    default:
      return failure(id, -32601, `Method not found: ${message.method}`)
  }
}
