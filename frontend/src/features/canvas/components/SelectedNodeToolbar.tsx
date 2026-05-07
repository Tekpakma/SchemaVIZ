import {
  CopyIcon,
  GroupIcon,
  MoreHorizontalIcon,
  Trash2Icon,
  UngroupIcon,
} from 'lucide-react'
import { useCanvasActions, useIsMarqueeSelecting } from '@/store/canvasStore'
import { useSelectedNodeToolbar } from '../hooks/useSelectedNodeToolbar'

const TOOLBAR_OFFSET_Y = 10

type ToolbarButtonProps = {
  label: string
  onClick?: () => void
  children: React.ReactNode
}

function ToolbarButton({ label, onClick, children }: ToolbarButtonProps) {
  return (
    <button
      aria-label={label}
      className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  )
}

export function SelectedNodeToolbar() {
  const placement = useSelectedNodeToolbar()
  const isMarqueeSelecting = useIsMarqueeSelecting()
  const { groupSelectedNodes, ungroupNode } = useCanvasActions()
  if (isMarqueeSelecting || !placement) return null

  const selectedGroupId = placement.selectedGroupId

  return (
    <div
      className="absolute left-0 top-0 z-20 flex h-9 items-center gap-1 rounded-md border border-border bg-popover px-1 shadow-sm"
      style={{
        transform: `translate(${placement.x}px, ${placement.y - TOOLBAR_OFFSET_Y}px) translate(-50%, -100%)`,
      }}
    >
      <span className="px-2 text-xs text-muted-foreground">
        {placement.selectedCount}
      </span>
      <div className="h-4 w-px bg-border" />
      {placement.canGroup && (
        <ToolbarButton label="Group" onClick={groupSelectedNodes}>
          <GroupIcon className="size-4" />
        </ToolbarButton>
      )}
      {placement.canUngroup && selectedGroupId && (
        <ToolbarButton
          label="Ungroup"
          onClick={() => ungroupNode(selectedGroupId)}
        >
          <UngroupIcon className="size-4" />
        </ToolbarButton>
      )}
      <ToolbarButton label="Duplicate">
        <CopyIcon className="size-4" />
      </ToolbarButton>
      <ToolbarButton label="Delete">
        <Trash2Icon className="size-4" />
      </ToolbarButton>
      <ToolbarButton label="More">
        <MoreHorizontalIcon className="size-4" />
      </ToolbarButton>
    </div>
  )
}
