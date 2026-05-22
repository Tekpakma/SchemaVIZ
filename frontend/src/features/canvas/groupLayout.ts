import type { LayoutOptions } from 'elkjs/lib/elk-api'

import type {
  CanvasGroupLayoutPolicy,
  CanvasGroupLayoutStrategy,
  CanvasGroupNode,
} from './model/types'

// ---------------------------------------------------------------------------
// Group layout — delegates child positioning to ELK.
//
// Each grouped node runs its own ELK algorithm via `hierarchyHandling:
// SEPARATE_CHILDREN`, so we don't pre-compute coordinates here. The legacy
// hand-rolled rectpacking lived in this file before; ELK does it natively
// (and honors child→child edges when present, which the old code couldn't).
// ---------------------------------------------------------------------------

type ResolvedStrategy = Exclude<CanvasGroupLayoutStrategy, 'auto'>

type ResolvedGroupLayoutPolicy = {
  strategy: CanvasGroupLayoutStrategy
  aspectRatio: number
  gapX: number
  gapY: number
  labelGap: number
  padding: {
    bottom: number
    left: number
    right: number
    top: number
  }
}

const DEFAULT_GROUP_LAYOUT_POLICY: ResolvedGroupLayoutPolicy = {
  strategy: 'auto',
  aspectRatio: 1.35,
  gapX: 28,
  gapY: 28,
  labelGap: 12,
  padding: {
    bottom: 36,
    left: 36,
    right: 36,
    top: 36,
  },
}

const ELK_ALGORITHM_BY_STRATEGY: Record<ResolvedStrategy, string> = {
  pack: 'rectpacking',
  flow: 'layered',
  tree: 'mrtree',
  cluster: 'force',
  hub: 'radial',
}

function getPositiveNumber(value: number | undefined, fallback: number) {
  return typeof value === 'number' && value > 0 ? value : fallback
}

/**
 * Legacy migration: older recipes persisted `mode: 'auto-pack' | 'freeform'`.
 * Both collapse to `strategy: 'auto'` — freeform never produced meaningful
 * coordinates anyway, and auto-pack is just the no-internal-edges default.
 */
function readStrategy(
  policy: CanvasGroupLayoutPolicy | undefined,
): CanvasGroupLayoutStrategy {
  if (policy?.strategy) return policy.strategy
  if (policy?.mode === 'auto-pack' || policy?.mode === 'freeform') return 'auto'
  return DEFAULT_GROUP_LAYOUT_POLICY.strategy
}

function resolveGroupLayoutPolicy(
  policy: CanvasGroupLayoutPolicy | undefined,
): ResolvedGroupLayoutPolicy {
  const padding = policy?.padding

  return {
    strategy: readStrategy(policy),
    aspectRatio: getPositiveNumber(
      policy?.aspectRatio,
      DEFAULT_GROUP_LAYOUT_POLICY.aspectRatio,
    ),
    gapX: getPositiveNumber(policy?.gapX, DEFAULT_GROUP_LAYOUT_POLICY.gapX),
    gapY: getPositiveNumber(policy?.gapY, DEFAULT_GROUP_LAYOUT_POLICY.gapY),
    labelGap: DEFAULT_GROUP_LAYOUT_POLICY.labelGap,
    padding: {
      bottom: getPositiveNumber(
        padding?.bottom,
        DEFAULT_GROUP_LAYOUT_POLICY.padding.bottom,
      ),
      left: getPositiveNumber(
        padding?.left,
        DEFAULT_GROUP_LAYOUT_POLICY.padding.left,
      ),
      right: getPositiveNumber(
        padding?.right,
        DEFAULT_GROUP_LAYOUT_POLICY.padding.right,
      ),
      top: getPositiveNumber(
        padding?.top,
        DEFAULT_GROUP_LAYOUT_POLICY.padding.top,
      ),
    },
  }
}

function getGroupTopPadding(
  group: CanvasGroupNode,
  policy: ResolvedGroupLayoutPolicy,
) {
  return group.contentHeight > 0
    ? group.contentHeight + policy.labelGap
    : policy.padding.top
}

function getGroupPaddingOption(top: number, policy: ResolvedGroupLayoutPolicy) {
  return `[top=${top},left=${policy.padding.left},bottom=${policy.padding.bottom},right=${policy.padding.right}]`
}

/**
 * Auto-detection: without internal edges, `pack` (rectpacking) gives a
 * compact aspect-ratio-aware grid. With internal edges, `flow` (layered)
 * routes them properly — something the previous fixed-position approach
 * couldn't do.
 */
function detectStrategy(hasInternalEdges: boolean): ResolvedStrategy {
  return hasInternalEdges ? 'flow' : 'pack'
}

function resolveEffectiveStrategy(
  policy: ResolvedGroupLayoutPolicy,
  hasInternalEdges: boolean,
): ResolvedStrategy {
  return policy.strategy === 'auto'
    ? detectStrategy(hasInternalEdges)
    : policy.strategy
}

export type GroupLayoutResolution = {
  layoutOptions: LayoutOptions
  strategy: ResolvedStrategy
}

/**
 * Returns ELK layout options to apply to a group ElkNode. The group runs its
 * own ELK algorithm via `SEPARATE_CHILDREN`; ELK computes child positions
 * and group dimensions during the same `elk.layout()` pass — callers must
 * NOT preset width/height/x/y on the group or its children.
 */
export function resolveGroupLayoutOptions(
  group: CanvasGroupNode,
  hasInternalEdges: boolean,
): GroupLayoutResolution {
  const policy = resolveGroupLayoutPolicy(group.groupLayout)
  const strategy = resolveEffectiveStrategy(policy, hasInternalEdges)
  const algorithm = ELK_ALGORITHM_BY_STRATEGY[strategy]
  const topPadding = getGroupTopPadding(group, policy)

  const layoutOptions: LayoutOptions = {
    'elk.algorithm': algorithm,
    'elk.hierarchyHandling': 'SEPARATE_CHILDREN',
    'elk.padding': getGroupPaddingOption(topPadding, policy),
    'elk.spacing.nodeNode': String(policy.gapX),
  }

  // rectpacking honors aspectRatio; other algorithms ignore it.
  if (algorithm === 'rectpacking') {
    layoutOptions['elk.aspectRatio'] = String(policy.aspectRatio)
  }

  // layered inside a group: keep edge routing orthogonal to match the parent.
  if (algorithm === 'layered') {
    layoutOptions['elk.edgeRouting'] = 'ORTHOGONAL'
    layoutOptions['elk.direction'] = 'RIGHT'
  }

  return { layoutOptions, strategy }
}
