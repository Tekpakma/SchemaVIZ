import { createFileRoute } from '@tanstack/react-router'

import { isMcpEnabled } from '@/features/ai/aiConfig'
import type { AiToolContext } from '@/features/ai/tools'
import { MCP_SERVER_INFO, dispatchMcpRequest } from '@/features/ai/mcp/server'

function readBearerToken(request: Request): string | null {
  const header = request.headers.get('authorization')
  if (!header?.toLowerCase().startsWith('bearer ')) return null

  const token = header.slice('bearer '.length).trim()
  return token.length > 0 ? token : null
}

function unauthorized() {
  return new Response(JSON.stringify({ error: 'invalid_token' }), {
    status: 401,
    headers: {
      'content-type': 'application/json',
      'www-authenticate': 'Bearer realm="schema-viz"',
    },
  })
}

export const Route = createFileRoute('/mcp')({
  server: {
    handlers: {
      GET: () => {
        if (!isMcpEnabled()) return new Response('Not found', { status: 404 })

        return Response.json({
          ...MCP_SERVER_INFO,
          instructions:
            'POST JSON-RPC 2.0 messages here with a Bearer token minted by `manage.py create_mcp_token`.',
        })
      },

      POST: async ({ request }) => {
        if (!isMcpEnabled()) return new Response('Not found', { status: 404 })

        const token = readBearerToken(request)
        if (!token) return unauthorized()

        // Django validates the token and resolves the real user; this user only
        // exists to satisfy the auth context shape.
        const context: AiToolContext = {
          auth: {
            kind: 'browser',
            user: { sub: 'mcp-client', name: 'MCP client' },
            accessToken: token,
          },
        }

        let message: Parameters<typeof dispatchMcpRequest>[0]
        try {
          message = await request.json()
        } catch {
          return Response.json(
            {
              jsonrpc: '2.0',
              id: null,
              error: { code: -32700, message: 'Parse error' },
            },
            { status: 400 },
          )
        }

        const response = await dispatchMcpRequest(message, context)

        // Notifications carry no reply.
        if (response === null) return new Response(null, { status: 202 })

        return Response.json(response)
      },
    },
  },
})
