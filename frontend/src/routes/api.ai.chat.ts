import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequest,
  maxIterations,
  mergeAgentTools,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import type { AnyServerTool } from '@tanstack/ai'
import {
  createOpenaiChat,
  createOpenaiChatCompletions,
} from '@tanstack/ai-openai'

import {
  AiNotConfiguredError,
  assertAiConfigured,
  resolveAiConfig,
} from '@/features/ai/aiConfig'
import type { ResolvedAiConfig } from '@/features/ai/aiConfig'
import { buildAssistantSystemPrompts } from '@/features/ai/systemPrompt'
import type { DiagramSnapshot } from '@/features/ai/systemPrompt'
import { assistantServerTools } from '@/features/ai/tools'
import type { AiToolContext } from '@/features/ai/tools'
import {
  authenticateBrowserRequest,
  getAuthMode,
  requestOrigin,
} from '@/serverAuth/startAuth'
import type { StartAuthContext } from '@/serverAuth/startAuth'

// The assistant never runs more than a handful of tool rounds per message;
// beyond that the model is looping rather than working.
const MAX_TOOL_ROUNDS = 12

/** Django session mode carries no token; the cookie travels via forwarded headers. */
const SESSION_MODE_USER: StartAuthContext = {
  kind: 'browser',
  user: { sub: 'django-session', name: 'Session user' },
}

function jsonError(status: number, message: string) {
  return Response.json({ error: message }, { status })
}

/**
 * The Responses API is OpenAI-only; every OpenAI-compatible server
 * (vLLM, LiteLLM, Azure, Open WebUI) speaks Chat Completions.
 */
function createAdapter(config: ResolvedAiConfig) {
  const model = config.model as Parameters<typeof createOpenaiChat>[0]
  return config.baseUrl
    ? createOpenaiChatCompletions(model, config.apiKey, {
        baseURL: config.baseUrl,
      })
    : createOpenaiChat(model, config.apiKey)
}

function readSnapshot(forwardedProps: Record<string, unknown>) {
  const snapshot = forwardedProps.diagram
  return snapshot && typeof snapshot === 'object'
    ? (snapshot as DiagramSnapshot)
    : null
}

export const Route = createFileRoute('/api/ai/chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth =
          (await authenticateBrowserRequest(request)) ??
          (getAuthMode() === 'session' ? SESSION_MODE_USER : null)
        if (!auth) return jsonError(401, 'Authentication required')

        let config: ResolvedAiConfig
        try {
          config = assertAiConfigured(await resolveAiConfig(auth))
        } catch (error) {
          if (error instanceof AiNotConfiguredError) {
            return jsonError(400, error.message)
          }
          throw error
        }

        const params = await chatParamsFromRequest(request)
        const context: AiToolContext = {
          auth,
          appOrigin: requestOrigin(request),
        }

        const stream = chat({
          adapter: createAdapter(config),
          messages: params.messages,
          systemPrompts: buildAssistantSystemPrompts(
            readSnapshot(params.forwardedProps),
          ),
          tools: mergeAgentTools(
            assistantServerTools as Array<AnyServerTool>,
            params.tools,
          ),
          context,
          agentLoopStrategy: maxIterations(MAX_TOOL_ROUNDS),
          threadId: params.threadId,
          runId: params.runId,
        })

        return toServerSentEventsResponse(stream)
      },
    },
  },
})
