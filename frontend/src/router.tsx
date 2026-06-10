import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { routeTree } from '@/routeTree.gen'
import { MutationCache, QueryClient } from '@tanstack/react-query'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { toast } from 'sonner'
import { GlobalLoader } from '@/components/GlobalLoader'

export function getRouter() {
  const mutationCache = new MutationCache({
    onSuccess: (_data, _variables, _context, mutation) => {
      const message = mutation.meta?.successMessage
      if (typeof message === 'string') {
        toast.success(message)
      }
    },
    onError: (error, _variables, _context, mutation) => {
      const message = mutation.meta?.errorMessage
      if (typeof message === 'string') {
        toast.error(message)
      } else if (mutation.meta?.successMessage) {
        // If we had a successMessage defined, show a generic error
        toast.error(error instanceof Error ? error.message : 'An error occurred')
      }
    },
  })
  const queryClient = new QueryClient({ mutationCache })
  const router = createTanStackRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    defaultPendingComponent: GlobalLoader,
  })
  setupRouterSsrQueryIntegration({
    router,
    queryClient,
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
