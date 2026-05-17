import { createMiddleware } from '@tanstack/react-start'

import type { StartAuthContext } from './startAuth'

/**
 * Function middleware that requires and provides the authenticated user/session.
 * The auth context is already resolved by the request middleware in start.ts —
 * this middleware makes protected server functions fail closed when it is absent.
 *
 * Usage:
 *   const myFn = createServerFn()
 *     .middleware([authFunctionMiddleware])
 *     .handler(({ context }) => {
 *       // context.auth is typed as StartAuthContext
 *     })
 */
export const authFunctionMiddleware = createMiddleware({
  type: 'function',
}).server(async ({ next, context }) => {
  const auth =
    (context as unknown as { auth?: StartAuthContext | null }).auth ?? null

  if (!auth) {
    throw new Error('Unauthorized')
  }

  return next({ context: { auth } })
})

/**
 * Optional variant for server functions that only need to observe auth state.
 */
export const optionalAuthFunctionMiddleware = createMiddleware({
  type: 'function',
}).server(async ({ next, context }) => {
  const auth =
    (context as unknown as { auth?: StartAuthContext | null }).auth ?? null

  return next({ context: { auth } })
})
