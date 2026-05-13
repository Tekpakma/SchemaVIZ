import {
  LanguagesIcon,
  MonitorIcon,
  MoonIcon,
  SettingsIcon,
  SunIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ThemeMode } from '@/features/theme/constants'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

import { SUPPORTED_LOCALES } from '@/features/i18n/constants'
import { useLocale } from '@/features/i18n/useI18n'
import { THEME_MODES } from '@/features/theme/constants'
import { useTheme } from '@/features/theme/useTheme'

const themeIcons = {
  dark: MoonIcon,
  light: SunIcon,
  system: MonitorIcon,
} satisfies Record<ThemeMode, typeof SunIcon>

export function Settings() {
  const { t } = useTranslation()
  const { locale, setLocale } = useLocale()
  const { theme, setTheme } = useTheme()


  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-2 px-2 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label={t('preferences.label')}
        >
          <SettingsIcon className="size-4" />
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {t(`language.${locale}`)} · {t(`theme.${theme}`)}
          </span>
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-64 p-3">
        <div className="space-y-4">
          <section className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <LanguagesIcon className="size-4" />
              {t('language.label')}
            </div>

            <div className="grid gap-1">
              {SUPPORTED_LOCALES.map((item) => (
                <Button
                  key={item}
                  variant={locale === item ? 'secondary' : 'ghost'}
                  className="justify-start"
                  size="sm"
                  onClick={() => setLocale(item)}
                >
                  {t(`language.${item}`)}
                </Button>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <div className="text-sm font-medium">
              {t('theme.label')}
            </div>

            <div className="grid grid-cols-3 gap-1">
              {THEME_MODES.map((mode) => {
                const Icon = themeIcons[mode]

                return (
                  <Button
                    key={mode}
                    variant={theme === mode ? 'secondary' : 'ghost'}
                    size="sm"
                    className="flex-col gap-1 h-auto py-2"
                    onClick={() => setTheme(mode)}
                  >
                    <Icon className="size-4" />
                    <span className="text-xs">
                      {t(`theme.${mode}`)}
                    </span>
                  </Button>
                )
              })}
            </div>
          </section>
        </div>
      </PopoverContent>
    </Popover>
  )
}
