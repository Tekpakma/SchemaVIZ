import { csrfSymbol } from '@tanstack/react-start'
import { describe, expect, it, vi } from 'vitest'

import { startInstance } from './start'

type StartOptions = Awaited<ReturnType<typeof startInstance.getOptions>>
type StartRequestMiddleware = NonNullable<
  StartOptions['requestMiddleware']
>[number]

function getFirstRequestMiddleware(
  options: StartOptions,
): StartRequestMiddleware {
  const middleware = options.requestMiddleware?.[0]
  if (!middleware) throw new Error('Expected request middleware to be present.')
  return middleware
}

async function runRequestMiddleware(
  middleware: StartRequestMiddleware,
  request: Request,
  handlerType: 'serverFn' | 'router' = 'serverFn',
) {
  const next = vi.fn(async () => ({
    context: undefined,
    pathname: new URL(request.url).pathname,
    request,
    response: new Response('ok'),
  }))
  const server = middleware.options.server as
    | ((options: {
        context: undefined
        handlerType: 'serverFn' | 'router'
        next: typeof next
        pathname: string
        request: Request
      }) => Promise<unknown>)
    | undefined

  const result = await server?.({
    context: undefined,
    handlerType,
    next,
    pathname: new URL(request.url).pathname,
    request,
  })

  return { next, result }
}

describe('startInstance middleware', () => {
  it('registers TanStack CSRF middleware before auth request context loading', async () => {
    const options = await startInstance.getOptions()
    const middleware = getFirstRequestMiddleware(options)

    expect(options.requestMiddleware ?? []).toHaveLength(2)
    expect(csrfSymbol in middleware).toBe(true)
  })

  it('rejects unsafe server function requests without same-origin proof', async () => {
    const options = await startInstance.getOptions()
    const middleware = getFirstRequestMiddleware(options)
    const request = new Request('http://app.test/_server/test', {
      method: 'POST',
    })

    const { next, result } = await runRequestMiddleware(middleware, request)

    expect(next).not.toHaveBeenCalled()
    expect(result).toBeInstanceOf(Response)
    expect((result as Response).status).toBe(403)
  })

  it('allows same-origin server function requests', async () => {
    const options = await startInstance.getOptions()
    const middleware = getFirstRequestMiddleware(options)
    const request = new Request('http://app.test/_server/test', {
      headers: {
        origin: 'http://app.test',
      },
      method: 'POST',
    })

    const { next, result } = await runRequestMiddleware(middleware, request)

    expect(next).toHaveBeenCalledOnce()
    expect(result).toHaveProperty('response')
  })
})
