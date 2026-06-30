import { lazy, Suspense } from 'react'
import {
  HeadContent,
  ScriptOnce,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { ReactQueryDevtoolsPanel } from '@tanstack/react-query-devtools'

import { Toaster } from 'sonner'
import { GlobalLoader } from '@/components/GlobalLoader'
import { I18nProvider } from '@/features/i18n/useI18n'
import { getLocalePreference } from '@/features/i18n/localeServerFns'
import { ThemeProvider } from '@/features/theme/useTheme'
import { getThemePreference } from '@/features/theme/themeServerFns'
import { CanvasStoreProvider } from '@/store/canvasStore'
import appCss from '../styles.css?url'
import faviconUrl from '@/branding/favicon.svg?url'
import type { QueryClient } from '@tanstack/react-query'

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient
}>()({
  pendingComponent: GlobalLoader,
  pendingMs: 200,
  loader: async () => {
    const [theme, locale] = await Promise.all([
      getThemePreference(),
      getLocalePreference(),
    ])

    return {
      locale,
      theme,
    }
  },
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        name: 'color-scheme',
        content: 'light dark',
      },
      {
        title: 'SchemaVIZ',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
      // Force the SchemaVIZ favicon across the app. The explicit ``icon``
      // link supersedes the browser's automatic ``/favicon.ico`` fetch in
      // every modern browser; ``shortcut icon`` covers legacy IE/Edge and
      // ``apple-touch-icon`` covers iOS home-screen installs.
      {
        rel: 'icon',
        type: 'image/svg+xml',
        href: faviconUrl,
      },
      {
        rel: 'shortcut icon',
        type: 'image/svg+xml',
        href: faviconUrl,
      },
      {
        rel: 'apple-touch-icon',
        href: faviconUrl,
      },
      {
        rel: 'mask-icon',
        href: faviconUrl,
        color: '#18181B',
      },
    ],
  }),
  shellComponent: RootDocument,
})

const CanvasDevtoolsPanel = lazy(async () => {
  const module =
    await import('@/features/canvas/components/CanvasDevtoolsPanel')
  return { default: module.CanvasDevtoolsPanel }
})
const systemThemeScript = `
try {
  var isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.classList.toggle('dark', isDark);
  document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
} catch (_) {}
`

function RootDocument({ children }: { children: React.ReactNode }) {
  const { locale, theme } = Route.useLoaderData()
  const resolvedTheme = theme === 'dark' ? 'dark' : 'light'
  const plugins = [
    {
      name: 'Tanstack Router',
      render: <TanStackRouterDevtoolsPanel />,
    },
    {
      name: 'React Query',
      render: <ReactQueryDevtoolsPanel />,
    },
    {
      name: 'Canvas',
      render: (
        <Suspense
          fallback={
            <div className="p-3 text-xs text-muted-foreground">
              Loading canvas tools...
            </div>
          }
        >
          <CanvasDevtoolsPanel />
        </Suspense>
      ),
    },
  ]

  return (
    <html
      className={resolvedTheme === 'dark' ? 'dark' : undefined}
      lang={locale}
      suppressHydrationWarning
    >
      <head>
        {theme === 'system' ? (
          <ScriptOnce>{systemThemeScript}</ScriptOnce>
        ) : null}
        <HeadContent />
      </head>
      <body>
        <CanvasStoreProvider>
          <ThemeProvider initialTheme={theme}>
            <I18nProvider initialLocale={locale}>{children}</I18nProvider>
          </ThemeProvider>
          <Toaster position="bottom-right" theme={resolvedTheme} richColors />
          <TanStackDevtools
            config={{
              position: 'bottom-right',
            }}
            plugins={plugins}
          />
        </CanvasStoreProvider>
        <Scripts />
      </body>
    </html>
  )
}
