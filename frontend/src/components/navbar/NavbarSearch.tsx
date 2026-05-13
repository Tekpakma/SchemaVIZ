import { Search } from 'lucide-react'

import { Input } from '@/components/ui/input'

export function NavbarSearch() {
  return (
    <label className="hidden max-w-80 min-w-0 flex-1 items-center gap-2 rounded-[7px] border border-input bg-muted px-2 py-1 text-muted-foreground md:inline-flex">
      <Search className="size-[13px] shrink-0" />
      <Input
        placeholder="Find a template, landscape, or node..."
        className="h-auto min-w-0 border-0 bg-transparent p-0 text-[13px] text-foreground shadow-none placeholder:text-muted-foreground focus-visible:ring-0"
      />
      <kbd className="shrink-0 rounded border border-border bg-background px-1.5 py-px font-mono text-[10px] text-muted-foreground">
        Ctrl K
      </kbd>
    </label>
  )
}
