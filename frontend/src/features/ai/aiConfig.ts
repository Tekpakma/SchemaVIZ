/**
 * Server-only resolution of the effective AI configuration.
 *
 * The API key is read from Django's internal `/session/ai-config/` endpoint
 * (per-user, encrypted at rest) and falls back to the deployment-wide
 * `SCHEMA_VIZ_AI_API_KEY` environment variable. It must never be sent to the
 * browser or included in an error response.
 */

import { getStartAuthBackend } from '@/serverAuth/startAuth'
import type { StartAuthContext } from '@/serverAuth/startAuth'
import { getForwardedBackendHeaders } from '@/features/canvas/layout.server'

export const DEFAULT_AI_MODEL = 'gpt-4o'

export type ResolvedAiConfig = {
  enabled: boolean
  apiKey: string
  baseUrl: string | undefined
  model: string
}

type DjangoAiConfig = {
  enabled?: boolean
  apiKey?: string
  baseUrl?: string
  model?: string
}

function envValue(name: string): string {
  return process.env[name]?.trim() || ''
}

async function fetchDjangoAiConfig(
  auth: StartAuthContext,
): Promise<DjangoAiConfig | null> {
  const { backendBaseUrl } = getStartAuthBackend()
  // Forwarded headers cover both bearer sessions and Django session cookies.
  const headers = getForwardedBackendHeaders(auth)

  try {
    const response = await fetch(`${backendBaseUrl}/session/ai-config/`, {
      headers,
    })
    if (!response.ok) {
      console.error(
        '[aiConfig] Django rejected the AI config request:',
        response.status,
      )
      return null
    }
    return (await response.json()) as DjangoAiConfig
  } catch (error) {
    console.error('[aiConfig] Failed to reach Django:', error)
    return null
  }
}

/** Merges the per-user Django configuration with the environment defaults. */
export async function resolveAiConfig(
  auth: StartAuthContext,
): Promise<ResolvedAiConfig> {
  const remote = await fetchDjangoAiConfig(auth)

  return {
    enabled: remote?.enabled !== false,
    apiKey: remote?.apiKey?.trim() || envValue('SCHEMA_VIZ_AI_API_KEY'),
    baseUrl:
      remote?.baseUrl?.trim() ||
      envValue('SCHEMA_VIZ_AI_BASE_URL') ||
      undefined,
    model:
      remote?.model?.trim() ||
      envValue('SCHEMA_VIZ_AI_MODEL') ||
      DEFAULT_AI_MODEL,
  }
}

export class AiNotConfiguredError extends Error {}

/**
 * Returns a usable configuration or throws {@link AiNotConfiguredError} with a
 * message that is safe to show to the user (it never contains the key).
 */
export function assertAiConfigured(config: ResolvedAiConfig): ResolvedAiConfig {
  if (!config.enabled) {
    throw new AiNotConfiguredError(
      'AI features are disabled for this deployment.',
    )
  }
  if (!config.apiKey) {
    throw new AiNotConfiguredError(
      'No AI API key configured. Add one in the settings or set SCHEMA_VIZ_AI_API_KEY.',
    )
  }
  return config
}

/** MCP server endpoint is opt-in via `SCHEMA_VIZ_MCP_ENABLED`. */
export function isMcpEnabled(): boolean {
  const value = envValue('SCHEMA_VIZ_MCP_ENABLED').toLowerCase()
  return value === '1' || value === 'true' || value === 'yes'
}
