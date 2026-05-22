import { describe, expect, it } from 'vitest'

import { resolveGroupLayoutOptions } from './groupLayout'
import type { CanvasGroupLayoutPolicy, CanvasGroupNode } from './model/types'

function createGroup(
  overrides: Partial<CanvasGroupNode> & {
    groupLayout?: CanvasGroupLayoutPolicy
  } = {},
): CanvasGroupNode {
  return {
    id: 'group',
    kind: 'group',
    shape: 'group',
    layoutMode: 'auto',
    x: 0,
    y: 0,
    width: 220,
    height: 160,
    lexicalJson: '',
    html: '',
    contentHeight: 0,
    version: 1,
    ...overrides,
  }
}

describe('resolveGroupLayoutOptions', () => {
  it('auto + no internal edges → rectpacking with aspect ratio', () => {
    const { layoutOptions, strategy } = resolveGroupLayoutOptions(
      createGroup(),
      false,
    )

    expect(strategy).toBe('pack')
    expect(layoutOptions).toMatchObject({
      'elk.algorithm': 'rectpacking',
      'elk.hierarchyHandling': 'SEPARATE_CHILDREN',
      'elk.aspectRatio': '1.35',
      'elk.spacing.nodeNode': '28',
      'elk.padding': '[top=36,left=36,bottom=36,right=36]',
    })
  })

  it('auto + internal edges → layered (flow)', () => {
    const { layoutOptions, strategy } = resolveGroupLayoutOptions(
      createGroup(),
      true,
    )

    expect(strategy).toBe('flow')
    expect(layoutOptions).toMatchObject({
      'elk.algorithm': 'layered',
      'elk.hierarchyHandling': 'SEPARATE_CHILDREN',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.direction': 'RIGHT',
    })
    expect(layoutOptions).not.toHaveProperty('elk.aspectRatio')
  })

  it('reserves label height as top padding', () => {
    const { layoutOptions } = resolveGroupLayoutOptions(
      createGroup({ contentHeight: 28 }),
      false,
    )

    expect(layoutOptions['elk.padding']).toBe(
      '[top=40,left=36,bottom=36,right=36]',
    )
  })

  it('honors explicit padding and gap overrides', () => {
    const { layoutOptions } = resolveGroupLayoutOptions(
      createGroup({
        groupLayout: {
          strategy: 'pack',
          aspectRatio: 2,
          gapX: 12,
          gapY: 10,
          padding: { top: 14, right: 18, bottom: 20, left: 16 },
        },
      }),
      false,
    )

    expect(layoutOptions).toMatchObject({
      'elk.algorithm': 'rectpacking',
      'elk.aspectRatio': '2',
      'elk.spacing.nodeNode': '12',
      'elk.padding': '[top=14,left=16,bottom=20,right=18]',
    })
  })

  it.each([
    ['tree', 'mrtree'],
    ['cluster', 'force'],
    ['hub', 'radial'],
    ['flow', 'layered'],
    ['pack', 'rectpacking'],
  ] as const)('explicit strategy %s → algorithm %s', (strategy, algorithm) => {
    const { layoutOptions } = resolveGroupLayoutOptions(
      createGroup({ groupLayout: { strategy } }),
      false,
    )

    expect(layoutOptions['elk.algorithm']).toBe(algorithm)
  })

  it('migrates legacy mode:auto-pack to strategy:auto', () => {
    const { strategy } = resolveGroupLayoutOptions(
      createGroup({ groupLayout: { mode: 'auto-pack' } }),
      false,
    )

    expect(strategy).toBe('pack')
  })

  it('migrates legacy mode:freeform to strategy:auto (no dead freeform path)', () => {
    const { layoutOptions, strategy } = resolveGroupLayoutOptions(
      createGroup({ groupLayout: { mode: 'freeform' } }),
      false,
    )

    expect(strategy).toBe('pack')
    expect(layoutOptions['elk.algorithm']).toBe('rectpacking')
  })

  it('legacy mode:freeform with internal edges still gets flow via auto-detection', () => {
    const { strategy } = resolveGroupLayoutOptions(
      createGroup({ groupLayout: { mode: 'freeform' } }),
      true,
    )

    expect(strategy).toBe('flow')
  })
})
