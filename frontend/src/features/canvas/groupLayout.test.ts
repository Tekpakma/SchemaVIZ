import { describe, expect, it } from 'vitest'
import type { ElkNode } from 'elkjs/lib/elk-api'

import { createPackedGroupLayout } from './groupLayout'
import type { CanvasGroupNode } from './model/types'

function createGroup(
  overrides: Partial<CanvasGroupNode> = {},
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

function createChildren(count: number): Array<ElkNode> {
  return Array.from({ length: count }, (_, index) => ({
    id: `child-${index + 1}`,
    width: 100,
    height: 80,
  }))
}

describe('group layout', () => {
  it('packs children into a deterministic grid and sizes the group', () => {
    const layout = createPackedGroupLayout(createGroup(), createChildren(5))

    expect(layout).toMatchObject({
      width: 428,
      height: 260,
      layoutOptions: {
        'elk.algorithm': 'fixed',
        'elk.padding': '[top=36,left=36,bottom=36,right=36]',
      },
    })
    expect(layout.children).toMatchObject([
      { id: 'child-1', x: 36, y: 36 },
      { id: 'child-2', x: 164, y: 36 },
      { id: 'child-3', x: 292, y: 36 },
      { id: 'child-4', x: 36, y: 144 },
      { id: 'child-5', x: 164, y: 144 },
    ])
  })

  it('reserves label height as top padding', () => {
    const layout = createPackedGroupLayout(
      createGroup({ contentHeight: 28 }),
      createChildren(1),
    )

    expect(layout.layoutOptions['elk.padding']).toBe(
      '[top=40,left=36,bottom=36,right=36]',
    )
    expect(layout.children[0]).toMatchObject({ x: 36, y: 40 })
  })

  it('supports policy-controlled max columns and gaps', () => {
    const layout = createPackedGroupLayout(
      createGroup({
        groupLayout: {
          maxColumns: 2,
          gapX: 12,
          gapY: 10,
          padding: {
            bottom: 20,
            left: 16,
            right: 18,
            top: 14,
          },
        },
      }),
      createChildren(5),
    )

    expect(layout).toMatchObject({
      width: 246,
      height: 294,
    })
    expect(layout.children).toMatchObject([
      { id: 'child-1', x: 16, y: 14 },
      { id: 'child-2', x: 128, y: 14 },
      { id: 'child-3', x: 16, y: 104 },
      { id: 'child-4', x: 128, y: 104 },
      { id: 'child-5', x: 16, y: 194 },
    ])
  })

  it('keeps freeform child positions while still marking the group fixed for ELK', () => {
    const layout = createPackedGroupLayout(
      createGroup({ groupLayout: { mode: 'freeform' } }),
      [
        { id: 'a', x: 22, y: 33, width: 100, height: 80 },
        { id: 'b', x: 180, y: 44, width: 100, height: 80 },
      ],
    )

    expect(layout).toMatchObject({
      width: 220,
      height: 160,
      layoutOptions: {
        'elk.algorithm': 'fixed',
      },
    })
    expect(layout.children).toMatchObject([
      { id: 'a', x: 22, y: 33 },
      { id: 'b', x: 180, y: 44 },
    ])
  })
})
