import { memo } from 'react'
import {
  BracesIcon,
  MagnetIcon,
  ScanIcon,
  WorkflowIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from 'lucide-react'
import {
  useCanvasActions,
  useShowResolvedReferences,
} from '@/store/canvasStore'
import { useCanvasHelperLines } from '../hooks/useCanvasHelperLines'

type CanvasViewportPanelProps = {
  canFitView: boolean
  canZoomIn: boolean
  canZoomOut: boolean
  isLayoutPending: boolean
  onFitView: () => void
  onLayout: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  showEditActions?: boolean
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

export const CanvasViewportPanel = memo(function CanvasViewportPanel({
  canFitView,
  canZoomIn,
  canZoomOut,
  isLayoutPending,
  onFitView,
  onLayout,
  onZoomIn,
  onZoomOut,
  showEditActions = true,
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
      {showEditActions ? (
        <>
          <div className="h-px bg-border" />
          <ViewportPanelButton
            label="Layout graph"
            disabled={!canFitView || isLayoutPending}
            pressed={isLayoutPending}
            onClick={onLayout}
          >
            <WorkflowIcon className="size-4" />
          </ViewportPanelButton>
        </>
      ) : null}
      <div className="h-px bg-border" />
      <ViewportPanelButton
        label="Fit view"
        disabled={!canFitView}
        onClick={onFitView}
      >
        <ScanIcon className="size-4" />
      </ViewportPanelButton>
      {showEditActions ? (
        <>
          <div className="h-px bg-border" />
          <HelperLinesButton />
          <div className="h-px bg-border" />
          <ReferenceValuesButton />
        </>
      ) : null}
    </div>
  )
})

function HelperLinesButton() {
  const { isEnabled, toggleHelperLines } = useCanvasHelperLines()

  return (
    <ViewportPanelButton
      label="Toggle helper lines"
      disabled={false}
      pressed={isEnabled}
      onClick={toggleHelperLines}
    >
      <MagnetIcon className="size-4" />
    </ViewportPanelButton>
  )
}

function ReferenceValuesButton() {
  const showResolved = useShowResolvedReferences()
  const { toggleResolvedReferences } = useCanvasActions()

  return (
    <ViewportPanelButton
      label="Toggle reference values"
      disabled={false}
      pressed={!showResolved}
      onClick={toggleResolvedReferences}
    >
      <BracesIcon className="size-4" />
    </ViewportPanelButton>
  )
}
