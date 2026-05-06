import { MonitorIcon, MoonIcon, SunIcon } from 'lucide-react'
import type { ThemeMode } from '@/features/theme/constants'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'
import { THEME_MODES } from '@/features/theme/constants'
import { useTheme } from '@/features/theme/useTheme'

const themeLabels: Record<ThemeMode, string> = {
  dark: 'Dark',
  light: 'Light',
  system: 'System',
}

const themeIcons = {
  dark: MoonIcon,
  light: SunIcon,
  system: MonitorIcon,
} satisfies Record<ThemeMode, typeof SunIcon>

export function Navbar() {
  const { theme, setTheme } = useTheme()
  const ThemeIcon = themeIcons[theme]

  return (
    <nav className="app-navbar border-b border-border bg-background">
      <div className="flex h-full items-center justify-between gap-3 px-3">
        <div className="flex h-8 items-center px-2 text-sm font-semibold">
          SchemaVIZ
        </div>

        <Select
          value={theme}
          onValueChange={(value) => setTheme(value as ThemeMode)}
        >
          <SelectTrigger
            aria-label="Theme"
            className="h-8 w-[130px] px-2"
            size="sm"
          >
            <ThemeIcon className="size-4" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {THEME_MODES.map((mode) => {
              const Icon = themeIcons[mode]

              return (
                <SelectItem key={mode} value={mode}>
                  <Icon className="size-4" />
                  {themeLabels[mode]}
                </SelectItem>
              )
            })}
          </SelectContent>
        </Select>
      </div>
    </nav>
  )
}
