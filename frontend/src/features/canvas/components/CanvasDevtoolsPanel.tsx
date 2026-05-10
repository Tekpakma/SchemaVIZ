import { useMemo } from 'react'
import {
  useCanvasActions,
  useCanvasEdges,
  useCanvasFlowDirection,
  useCanvasIsStageMounted,
  useCanvasLayoutOptions,
  useCanvasNodes,
  useCanvasNodeIds,
  useCanvasRoutingAuthority,
  useCanvasStageSizeValue,
} from '@/store/canvasStore'
import { useCanvasLayout } from '../hooks/useCanvasLayout'
import type {
  CanvasFlowDirection,
  CanvasRoutingAuthorityMode,
} from '../model/types'

const FLOW_DIRECTION_OPTIONS: Array<{
  value: CanvasFlowDirection
  label: string
}> = [
  { value: 'LR', label: 'L -> R' },
  { value: 'RL', label: 'R -> L' },
  { value: 'TB', label: 'T -> B' },
  { value: 'BT', label: 'B -> T' },
]

const EDGE_ROUTING_OPTIONS = [
  { value: 'ORTHOGONAL', label: 'Orth' },
  { value: 'POLYLINE', label: 'Poly' },
  { value: 'SPLINES', label: 'Spline' },
] as const

const ROUTING_AUTHORITY_OPTIONS: Array<{
  value: CanvasRoutingAuthorityMode
  label: string
}> = [
  { value: 'auto', label: 'Auto' },
  { value: 'manual', label: 'Manual' },
]

type EdgeRoutingOption = (typeof EDGE_ROUTING_OPTIONS)[number]['value']

type DevtoolsOptionButtonProps = {
  active: boolean
  disabled?: boolean
  label: string
  onClick: () => void
}

function DevtoolsOptionButton({
  active,
  disabled = false,
  label,
  onClick,
}: DevtoolsOptionButtonProps) {
  return (
    <button
      className={`rounded-sm border px-2 py-1 text-xs transition-colors ${
        disabled
          ? 'pointer-events-none border-border bg-background text-muted-foreground opacity-50'
          : ''
      } ${
        active
          ? 'border-foreground bg-foreground text-background'
          : 'border-border bg-background text-muted-foreground hover:border-foreground/40 hover:text-foreground'
      }`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  )
}

export function CanvasDevtoolsPanel() {
  const isStageMounted = useCanvasIsStageMounted()
  const nodes = useCanvasNodes()
  const edges = useCanvasEdges()
  const nodeIds = useCanvasNodeIds()
  const stageSize = useCanvasStageSizeValue()
  const flowDirection = useCanvasFlowDirection()
  const routingAuthority = useCanvasRoutingAuthority()
  const layoutOptions = useCanvasLayoutOptions()
  const { setFlowDirection, setLayoutOptions, setRoutingAuthority } =
    useCanvasActions()
  const { handleLayoutGraph, isLayoutPending } = useCanvasLayout(stageSize)
  const canRelayout = isStageMounted && nodeIds.length > 0

  const edgeRouting =
    (layoutOptions['elk.edgeRouting'] as EdgeRoutingOption | undefined) ??
    'ORTHOGONAL'

  const { manualNodeCount, fixedEdgeCount } = useMemo(() => {
    const manualNodes = Object.values(nodes).filter(
      (node) => node.layoutMode === 'manual',
    ).length
    const fixedEdges = Object.values(edges).filter(
      (edge) => edge.sourcePort?.side || edge.targetPort?.side,
    ).length

    return {
      manualNodeCount: manualNodes,
      fixedEdgeCount: fixedEdges,
    }
  }, [edges, nodes])

  const applyExperiment = (update: () => void) => {
    update()

    if (!canRelayout || isLayoutPending) {
      return
    }

    handleLayoutGraph()
  }

  if (!isStageMounted) {
    return (
      <div className="flex h-full items-center justify-center p-3">
        <div className="rounded-md border border-dashed border-border bg-background/70 p-3 text-xs text-muted-foreground">
          Open the canvas screen to use the layout and routing controls here.
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-4 p-3">
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-foreground">
            Routing authority
          </span>
          <span className="text-[10px] uppercase text-muted-foreground">
            {routingAuthority}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {ROUTING_AUTHORITY_OPTIONS.map((option) => (
            <DevtoolsOptionButton
              key={option.value}
              active={routingAuthority === option.value}
              label={option.label}
              onClick={() => {
                setRoutingAuthority(option.value)
              }}
            />
          ))}
        </div>
        <div className="rounded-sm border border-border bg-background p-2 text-[11px] text-muted-foreground">
          {manualNodeCount} manual node{manualNodeCount === 1 ? '' : 's'} ·{' '}
          {fixedEdgeCount} fixed edge{fixedEdgeCount === 1 ? '' : 's'}
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-foreground">Edge flow</span>
          <span className="text-[10px] uppercase text-muted-foreground">
            {flowDirection}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {FLOW_DIRECTION_OPTIONS.map((option) => (
            <DevtoolsOptionButton
              key={option.value}
              active={flowDirection === option.value}
              label={option.label}
              onClick={() => {
                applyExperiment(() => {
                  setFlowDirection(option.value)
                })
              }}
            />
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-foreground">
            Edge routing
          </span>
          <span className="text-[10px] uppercase text-muted-foreground">
            {edgeRouting}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {EDGE_ROUTING_OPTIONS.map((option) => (
            <DevtoolsOptionButton
              key={option.value}
              active={edgeRouting === option.value}
              label={option.label}
              onClick={() => {
                applyExperiment(() => {
                  setLayoutOptions({
                    'elk.edgeRouting': option.value,
                  })
                })
              }}
            />
          ))}
        </div>
      </section>

      <div className="mt-auto flex items-center justify-between rounded-sm border border-border bg-background p-2 text-xs text-muted-foreground">
        <span>Applies immediately and can be deleted as one slice.</span>
        <button
          className="rounded-sm border border-border px-2 py-1 text-foreground transition-colors hover:border-foreground/40 disabled:pointer-events-none disabled:opacity-40"
          disabled={!canRelayout || isLayoutPending}
          onClick={() => {
            handleLayoutGraph()
          }}
          type="button"
        >
          Re-layout
        </button>
      </div>
    </div>
  )
}