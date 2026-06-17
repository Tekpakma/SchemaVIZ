import { Search } from 'lucide-react'

type NavbarSearchProps = {
  onOpen: () => void
}

export function NavbarSearch({ onOpen }: NavbarSearchProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="inline-flex size-8 shrink-0 items-center justify-center gap-2 rounded-md border border-input bg-muted text-left text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:h-8 md:max-w-80 md:min-w-0 md:flex-1 md:justify-start md:px-2"
      aria-label="Open command center"
    >
      <Search className="size-[13px] shrink-0" />
      <span className="hidden min-w-0 flex-1 truncate text-[13px] md:block">
        Find a template, landscape, or model...
      </span>
      <kbd className="hidden shrink-0 rounded border border-border bg-background px-1.5 py-px font-mono text-[10px] text-muted-foreground md:inline">
        Ctrl K
      </kbd>
    </button>
  )
}
