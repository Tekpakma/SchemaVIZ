import type { ElkNode, LayoutOptions } from 'elkjs/lib/elk-api'

import type { CanvasGroupLayoutPolicy, CanvasGroupNode } from './model/types'

type ResolvedGroupLayoutPolicy = {
  aspectRatio: number
  gapX: number
  gapY: number
  labelGap: number
  maxColumns: number | null
  maxWidth: number
  mode: 'auto-pack' | 'freeform'
  padding: {
    bottom: number
    left: number
    right: number
    top: number
  }
}

export type PackedGroupLayout = {
  children: Array<ElkNode>
  height: number
  layoutOptions: LayoutOptions
  width: number
}

const DEFAULT_GROUP_LAYOUT_POLICY: ResolvedGroupLayoutPolicy = {
  aspectRatio: 1.35,
  gapX: 28,
  gapY: 28,
  labelGap: 12,
  maxColumns: null,
  maxWidth: 1800,
  mode: 'auto-pack',
  padding: {
    bottom: 36,
    left: 36,
    right: 36,
    top: 36,
  },
}

function getPositiveNumber(value: number | undefined, fallback: number) {
  return typeof value === 'number' && value > 0 ? value : fallback
}

function resolveGroupLayoutPolicy(
  policy: CanvasGroupLayoutPolicy | undefined,
): ResolvedGroupLayoutPolicy {
  const padding = policy?.padding

  return {
    aspectRatio: getPositiveNumber(
      policy?.aspectRatio,
      DEFAULT_GROUP_LAYOUT_POLICY.aspectRatio,
    ),
    gapX: getPositiveNumber(policy?.gapX, DEFAULT_GROUP_LAYOUT_POLICY.gapX),
    gapY: getPositiveNumber(policy?.gapY, DEFAULT_GROUP_LAYOUT_POLICY.gapY),
    labelGap: DEFAULT_GROUP_LAYOUT_POLICY.labelGap,
    maxColumns:
      typeof policy?.maxColumns === 'number' && policy.maxColumns > 0
        ? Math.floor(policy.maxColumns)
        : DEFAULT_GROUP_LAYOUT_POLICY.maxColumns,
    maxWidth: getPositiveNumber(
      policy?.maxWidth,
      DEFAULT_GROUP_LAYOUT_POLICY.maxWidth,
    ),
    mode: policy?.mode ?? DEFAULT_GROUP_LAYOUT_POLICY.mode,
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

function getPackedSize({
  cell,
  columns,
  childCount,
  policy,
  topPadding,
}: {
  cell: { height: number; width: number }
  childCount: number
  columns: number
  policy: ResolvedGroupLayoutPolicy
  topPadding: number
}) {
  const rows = Math.ceil(childCount / columns)

  return {
    height:
      topPadding +
      rows * cell.height +
      Math.max(0, rows - 1) * policy.gapY +
      policy.padding.bottom,
    rows,
    width:
      policy.padding.left +
      columns * cell.width +
      Math.max(0, columns - 1) * policy.gapX +
      policy.padding.right,
  }
}

function getMaxColumnsForWidth(
  cell: { height: number; width: number },
  policy: ResolvedGroupLayoutPolicy,
) {
  if (cell.width <= 0) return 1

  const availableWidth =
    policy.maxWidth - policy.padding.left - policy.padding.right
  if (availableWidth <= cell.width) return 1

  return Math.max(
    1,
    Math.floor((availableWidth + policy.gapX) / (cell.width + policy.gapX)),
  )
}

function getPackedColumnCount({
  cell,
  childCount,
  policy,
  topPadding,
}: {
  cell: { height: number; width: number }
  childCount: number
  policy: ResolvedGroupLayoutPolicy
  topPadding: number
}) {
  if (childCount <= 1) return childCount

  const maxColumns = Math.min(
    childCount,
    policy.maxColumns ?? Number.POSITIVE_INFINITY,
    getMaxColumnsForWidth(cell, policy),
  )

  let best = {
    columns: 1,
    emptySlots: childCount - 1,
    score: Number.POSITIVE_INFINITY,
  }

  for (let columns = 1; columns <= maxColumns; columns++) {
    const size = getPackedSize({
      cell,
      childCount,
      columns,
      policy,
      topPadding,
    })
    const aspectRatio = size.width / Math.max(1, size.height)
    const emptySlots = size.rows * columns - childCount
    const score =
      Math.abs(aspectRatio - policy.aspectRatio) +
      emptySlots * 0.015 +
      columns * 0.001

    if (score < best.score) {
      best = { columns, emptySlots, score }
    }
  }

  return best.columns
}

function getCellSize(children: Array<ElkNode>) {
  return {
    height: Math.max(0, ...children.map((child) => child.height ?? 0)),
    width: Math.max(0, ...children.map((child) => child.width ?? 0)),
  }
}

function createFreeformGroupLayout(
  group: CanvasGroupNode,
  children: Array<ElkNode>,
  policy: ResolvedGroupLayoutPolicy,
): PackedGroupLayout {
  const topPadding = getGroupTopPadding(group, policy)

  return {
    children,
    height: group.height,
    layoutOptions: {
      'elk.padding': getGroupPaddingOption(topPadding, policy),
      ...(children.length > 0 ? { 'elk.algorithm': 'fixed' } : {}),
    },
    width: group.width,
  }
}

export function createPackedGroupLayout(
  group: CanvasGroupNode,
  children: Array<ElkNode>,
): PackedGroupLayout {
  const policy = resolveGroupLayoutPolicy(group.groupLayout)
  if (policy.mode === 'freeform' || children.length === 0) {
    return createFreeformGroupLayout(group, children, policy)
  }

  const cell = getCellSize(children)
  const topPadding = getGroupTopPadding(group, policy)
  const columns = getPackedColumnCount({
    cell,
    childCount: children.length,
    policy,
    topPadding,
  })
  const size = getPackedSize({
    cell,
    childCount: children.length,
    columns,
    policy,
    topPadding,
  })

  const packedChildren = children.map((child, index) => {
    const column = index % columns
    const row = Math.floor(index / columns)
    const childWidth = child.width ?? 0
    const childHeight = child.height ?? 0

    return {
      ...child,
      x:
        policy.padding.left +
        column * (cell.width + policy.gapX) +
        (cell.width - childWidth) / 2,
      y:
        topPadding +
        row * (cell.height + policy.gapY) +
        (cell.height - childHeight) / 2,
    }
  })

  return {
    children: packedChildren,
    height: Math.max(group.height, size.height),
    layoutOptions: {
      'elk.algorithm': 'fixed',
      'elk.padding': getGroupPaddingOption(topPadding, policy),
    },
    width: Math.max(group.width, size.width),
  }
}
