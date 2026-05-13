import { PlusIcon, XIcon } from 'lucide-react'
import {
  useActiveCanvasTabId,
  useCanvasTabActions,
  useCanvasTabs,
} from '@/store/canvasStore'

export function CanvasTabBar() {
  const tabs = useCanvasTabs()
  const activeTabId = useActiveCanvasTabId()
  const { closeTab, createTab, switchTab } = useCanvasTabActions()

  return (
    <div className="flex h-10 shrink-0 items-end border-b border-border bg-background px-2">
      <div
        aria-label="Canvas documents"
        className="flex min-w-0 flex-1 items-end gap-1 overflow-x-auto"
        role="tablist"
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId

          return (
            <div
              className={[
                'group flex h-9 max-w-52 min-w-24 items-center border-x border-t px-2',
                isActive
                  ? 'border-border bg-background text-foreground'
                  : 'border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground',
              ].join(' ')}
              key={tab.id}
            >
              <button
                aria-selected={isActive}
                className="min-w-0 flex-1 truncate text-left text-sm font-medium"
                onClick={() => switchTab(tab.id)}
                role="tab"
                type="button"
              >
                {tab.label}
                {tab.dirty ? <span aria-hidden="true"> *</span> : null}
              </button>
              {tab.closable ? (
                <button
                  aria-label={`Close ${tab.label}`}
                  className="ml-1 grid size-5 shrink-0 place-items-center text-muted-foreground hover:text-foreground"
                  onClick={(event) => {
                    event.stopPropagation()
                    closeTab(tab.id)
                  }}
                  title={`Close ${tab.label}`}
                  type="button"
                >
                  <XIcon className="size-3.5" />
                </button>
              ) : null}
            </div>
          )
        })}
      </div>
      <button
        aria-label="New canvas"
        className="mb-1 ml-1 grid size-7 shrink-0 place-items-center text-muted-foreground hover:bg-muted hover:text-foreground"
        onClick={() => createTab()}
        title="New canvas"
        type="button"
      >
        <PlusIcon className="size-4" />
      </button>
    </div>
  )
}
