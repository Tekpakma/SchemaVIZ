import { createIsomorphicFn } from '@tanstack/react-start'
import z from 'zod'

export const appEnvSchema = z.object({
  VITE_SCHEMA_VIZ_BACKEND_BASE_URL: z
    .url({ normalize: true })
    .default('http://127.0.0.1:8000'),
})

export const serverAppEnvSchema = appEnvSchema.extend({
  // For future server-only environment variables
})
export type AppEnv = z.infer<typeof appEnvSchema>
export type ServerAppEnv = z.infer<typeof serverAppEnvSchema>

export const getAppEnv = createIsomorphicFn()
  .server(() => serverAppEnvSchema.parse(process.env))
  .client(() => appEnvSchema.parse(import.meta.env))
