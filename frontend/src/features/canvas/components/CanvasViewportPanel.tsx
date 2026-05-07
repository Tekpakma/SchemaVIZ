import { ZoomInIcon, ZoomOutIcon } from 'lucide-react'

type CanvasViewportPanelProps = {
  canZoomIn: boolean
  canZoomOut: boolean
  onZoomIn: () => void
  onZoomOut: () => void
}

type ViewportPanelButtonProps = {
  label: string
  disabled: boolean
  onClick: () => void
  children: React.ReactNode
}

function ViewportPanelButton({
  label,
  disabled,
  onClick,
  children,
}: ViewportPanelButtonProps) {
  return (
    <button
      aria-label={label}
      className="flex size-8 items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  )
}

export function CanvasViewportPanel({
  canZoomIn,
  canZoomOut,
  onZoomIn,
  onZoomOut,
}: CanvasViewportPanelProps) {
  return (
    <div className="absolute bottom-4 left-4 z-20 flex flex-col overflow-hidden rounded-md border border-border bg-popover shadow-sm">
      <ViewportPanelButton
        label="Zoom in"
        disabled={!canZoomIn}
        onClick={onZoomIn}
      >
        <ZoomInIcon className="size-4" />
      </ViewportPanelButton>
      <div className="h-px bg-border" />
      <ViewportPanelButton
        label="Zoom out"
        disabled={!canZoomOut}
        onClick={onZoomOut}
      >
        <ZoomOutIcon className="size-4" />
      </ViewportPanelButton>
    </div>
  )
}
