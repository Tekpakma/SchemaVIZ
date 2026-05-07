import { MagnetIcon, ScanIcon, ZoomInIcon, ZoomOutIcon } from 'lucide-react'
import { useCanvasHelperLines } from '../hooks/useCanvasHelperLines'

type CanvasViewportPanelProps = {
  canFitView: boolean
  canZoomIn: boolean
  canZoomOut: boolean
  onFitView: () => void
  onZoomIn: () => void
  onZoomOut: () => void
}

type ViewportPanelButtonProps = {
  label: string
  disabled: boolean
  onClick: () => void
  pressed?: boolean
  children: React.ReactNode
}

function ViewportPanelButton({
  label,
  disabled,
  onClick,
  pressed = false,
  children,
}: ViewportPanelButtonProps) {
  return (
    <button
      aria-label={label}
      aria-pressed={pressed || undefined}
      className={`flex size-8 items-center justify-center hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40 ${
        pressed ? 'bg-accent text-foreground' : 'text-muted-foreground'
      }`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  )
}

export function CanvasViewportPanel({
  canFitView,
  canZoomIn,
  canZoomOut,
  onFitView,
  onZoomIn,
  onZoomOut,
}: CanvasViewportPanelProps) {
  const { isEnabled: helperLinesEnabled, toggleHelperLines } =
    useCanvasHelperLines()

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
      <div className="h-px bg-border" />
      <ViewportPanelButton
        label="Fit view"
        disabled={!canFitView}
        onClick={onFitView}
      >
        <ScanIcon className="size-4" />
      </ViewportPanelButton>
      <div className="h-px bg-border" />
      <ViewportPanelButton
        label="Toggle helper lines"
        disabled={false}
        pressed={helperLinesEnabled}
        onClick={toggleHelperLines}
      >
        <MagnetIcon className="size-4" />
      </ViewportPanelButton>
    </div>
  )
}
