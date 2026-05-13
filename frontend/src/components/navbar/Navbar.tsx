import { Bell, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { BrandLogo } from './BrandLogo'
import { NavbarSearch } from './NavbarSearch'
import { NavigationTabs } from './NavigationTabs'
import { Settings } from './Settings'
import type { NavbarProps } from './types'

export function Navbar({ onNew }: NavbarProps) {
  return (
    <header className="app-navbar sticky top-0 z-30 flex items-center gap-3.5 border-b border-border bg-background px-3 text-[13px] text-foreground">
      <BrandLogo />
      <NavigationTabs />
      <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2">
        <NavbarSearch />
        <div className="mx-0.5 h-[22px] w-px bg-border" />
        <Button
          variant="ghost"
          size="icon-sm"
          className="relative text-muted-foreground hover:text-foreground"
          title="Notifications"
          aria-label="Notifications"
        >
          <Bell className="size-[15px]" />
          <span className="absolute right-[7px] top-1.5 size-1.5 rounded-full border-[1.5px] border-background bg-brand" />
        </Button>
        <Settings />
        <Button
          size="sm"
          className="gap-1.5 rounded-[7px] bg-primary text-[12.5px] font-medium text-primary-foreground hover:bg-primary/90"
          onClick={onNew}
        >
          <Plus className="size-[13px]" />
          New
        </Button>
        <div className="mx-0.5 h-[22px] w-px bg-border" />
        <button
          type="button"
          className="grid size-7 place-items-center rounded-full bg-brand text-[10.5px] font-semibold tracking-wide text-brand-foreground hover:ring-[3px] hover:ring-brand-muted"
          title="Kai Sommer"
          aria-label="Kai Sommer"
        >
          KS
        </button>
      </div>
    </header>
  )
}
