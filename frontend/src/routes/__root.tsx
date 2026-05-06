import {
  HeadContent,
  ScriptOnce,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { ReactQueryDevtoolsPanel } from '@tanstack/react-query-devtools'

import { I18nProvider } from '@/features/i18n/useI18n'
import { getLocalePreference } from '@/features/i18n/localeServerFns'
import { ThemeProvider } from '@/features/theme/useTheme'
import { getThemePreference } from '@/features/theme/themeServerFns'
import appCss from '../styles.css?url'

export const Route = createRootRoute({
  loader: async () => {
    const theme = await getThemePreference()
    const locale = await getLocalePreference()

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
    ],
  }),
  shellComponent: RootDocument,
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

  return (
    <html
      className={resolvedTheme === 'dark' ? 'dark' : undefined}
      lang={locale}
      suppressHydrationWarning
    >
      <head>
        {theme === 'system' ? <ScriptOnce>{systemThemeScript}</ScriptOnce> : null}
        <HeadContent />
      </head>
      <body>
        <ThemeProvider initialTheme={theme}>
          <I18nProvider initialLocale={locale}>{children}</I18nProvider>
        </ThemeProvider>
        <TanStackDevtools
          config={{
            position: 'bottom-right',
          }}
          plugins={[
            {
              name: 'Tanstack Router',
              render: <TanStackRouterDevtoolsPanel />,
            },
            {
              name: 'React Query',
              render: <ReactQueryDevtoolsPanel />
            }
          ]}
        />
        <Scripts />
      </body>
    </html>
  )
}
