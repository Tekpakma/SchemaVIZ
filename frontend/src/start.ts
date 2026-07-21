import {
  createCsrfMiddleware,
  createMiddleware,
  createStart,
} from '@tanstack/react-start'

import { authenticateBrowserRequest } from './serverAuth/startAuth'
import type { StartAuthContext } from './serverAuth/startAuth'

function isDevelopmentCsrfBypassEnabled() {
  return process.env.NODE_ENV === 'development'
}

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) =>
    !isDevelopmentCsrfBypassEnabled() && ctx.handlerType === 'serverFn',
})

const authRequestMiddleware = createMiddleware().server(
  async ({ request, next }) => {
    const auth = await authenticateBrowserRequest(request)
    return next({ context: { auth } })
  },
)

export type AuthContext = {
  auth: StartAuthContext | null
}

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware, authRequestMiddleware],
}))
