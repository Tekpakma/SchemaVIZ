import { createIsomorphicFn } from '@tanstack/react-start'
import z from 'zod'

export const appEnvSchema = z.object({})

export const serverAppEnvSchema = appEnvSchema.extend({
  SCHEMA_VIZ_AUTH_MODE: z.enum(['dev', 'oidc']).default('dev'),
  SCHEMA_VIZ_AUTH_SECRET: z.string().optional(),
  SCHEMA_VIZ_SERVER_BASE_URL: z.string().default('http://localhost:8000/schema-viz'),
  SCHEMA_VIZ_OIDC_ISSUER: z.string().optional(),
  SCHEMA_VIZ_OIDC_CLIENT_ID: z.string().optional(),
  SCHEMA_VIZ_OIDC_CLIENT_SECRET: z.string().optional(),
  SCHEMA_VIZ_OIDC_SCOPE: z.string().optional(),
})
export type AppEnv = z.infer<typeof appEnvSchema>
export type ServerAppEnv = z.infer<typeof serverAppEnvSchema>

export const getAppEnv = createIsomorphicFn()
  .server(() => serverAppEnvSchema.parse(process.env))
  .client(() => appEnvSchema.parse(import.meta.env))
