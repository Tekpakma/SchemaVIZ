import {
  HeadContent,
  ScriptOnce,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'

import { ThemeProvider } from '@/features/theme/useTheme'
import { getThemePreference } from '@/features/theme/themeServerFns'
import appCss from '../styles.css?url'

export const Route = createRootRoute({
  loader: async () => {
    const theme = await getThemePreference()

    return {
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
  const { theme } = Route.useLoaderData()
  const resolvedTheme = theme === 'dark' ? 'dark' : 'light'

  return (
    <html
      className={resolvedTheme === 'dark' ? 'dark' : undefined}
      lang="en"
      suppressHydrationWarning
    >
      <head>
        {theme === 'system' ? <ScriptOnce>{systemThemeScript}</ScriptOnce> : null}
        <HeadContent />
      </head>
      <body>
        <ThemeProvider initialTheme={theme}>{children}</ThemeProvider>
        <TanStackDevtools
          config={{
            position: 'bottom-right',
          }}
          plugins={[
            {
              name: 'Tanstack Router',
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
        <Scripts />
      </body>
    </html>
  )
}
