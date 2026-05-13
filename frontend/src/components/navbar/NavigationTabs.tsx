import { FileText, LayoutGrid, Network, Users } from 'lucide-react'

import { cn } from '@/lib/utils'

const NAVIGATION_TABS = [
  { label: 'Templates', icon: LayoutGrid, active: true },
  { label: 'Landscapes', icon: Network },
  { label: 'Shared', icon: Users },
  { label: 'Drafts', icon: FileText, badge: 3 },
] as const

export function NavigationTabs() {
  return (
    <nav className="flex h-full items-center gap-0.5 px-1" aria-label="Primary">
      {NAVIGATION_TABS.map((tab) => (
        <button
          key={tab.label}
          type="button"
          className={cn(
            'relative inline-flex items-center gap-1.5 rounded-[7px] px-2.5 py-1 text-[12.5px] text-muted-foreground',
            'hover:bg-accent hover:text-foreground',
            tab.active &&
              'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground',
          )}
          aria-current={tab.active ? 'page' : undefined}
        >
          <tab.icon
            className={cn('size-3.5', tab.active && 'text-primary-foreground')}
          />
          {tab.label}
          {'badge' in tab && tab.badge != null ? (
            <span
              className={cn(
                  'ml-0.5 rounded-full px-1.5 py-px font-mono text-[9.5px]',
                  tab.active
                    ? 'bg-primary-foreground/20 text-primary-foreground'
                    : 'bg-brand-muted text-brand',
              )}
            >
              {tab.badge}
            </span>
          ) : null}
        </button>
      ))}
    </nav>
  )
}
