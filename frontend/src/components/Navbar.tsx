import { LanguagesIcon, MonitorIcon, MoonIcon, SunIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ThemeMode } from '@/features/theme/constants'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from './ui/select'
import { SUPPORTED_LOCALES } from '@/features/i18n/constants'
import type { Locale } from '@/features/i18n/constants'
import { useLocale } from '@/features/i18n/useI18n'
import { THEME_MODES } from '@/features/theme/constants'
import { useTheme } from '@/features/theme/useTheme'

const themeIcons = {
  dark: MoonIcon,
  light: SunIcon,
  system: MonitorIcon,
} satisfies Record<ThemeMode, typeof SunIcon>

export function Navbar() {
  const { t } = useTranslation()
  const { locale, setLocale } = useLocale()
  const { theme, setTheme } = useTheme()
  const ThemeIcon = themeIcons[theme]

  return (
    <nav className="app-navbar border-b border-border bg-background">
      <div className="flex h-full items-center justify-between gap-3 px-3">
        <div className="flex h-8 items-center px-2 text-sm font-semibold">
          SchemaVIZ
        </div>

        <div className="flex items-center gap-2">
          <Select
            value={locale}
            onValueChange={(value) => setLocale(value as Locale)}
          >
            <SelectTrigger
              aria-label={t('language.label')}
              className="h-8 w-[118px] px-2"
              size="sm"
            >
              <LanguagesIcon className="size-4" />
              <span className="flex min-w-0 items-center truncate">
                {t(`language.${locale}`)}
              </span>
            </SelectTrigger>
            <SelectContent align="end">
              {SUPPORTED_LOCALES.map((mode) => (
                <SelectItem key={mode} value={mode}>
                  {t(`language.${mode}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={theme}
            onValueChange={(value) => setTheme(value as ThemeMode)}
          >
            <SelectTrigger
              aria-label={t('theme.label')}
              className="h-8 w-[130px] px-2"
              size="sm"
            >
              <ThemeIcon className="size-4" />
              <span className="flex min-w-0 items-center truncate">
                {t(`theme.${theme}`)}
              </span>
            </SelectTrigger>
            <SelectContent align="end">
              {THEME_MODES.map((mode) => {
                const Icon = themeIcons[mode]

                return (
                  <SelectItem key={mode} value={mode}>
                    <Icon className="size-4" />
                    {t(`theme.${mode}`)}
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
        </div>
      </div>
    </nav>
  )
}
