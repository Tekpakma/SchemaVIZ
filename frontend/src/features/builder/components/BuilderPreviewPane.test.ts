import { describe, expect, it } from 'vitest'

import {
  getBuilderPreviewRelayoutSignature,
  shouldAutoLayout,
  shouldShowEdges,
} from '../builderPreviewMode'
import type {
  CanvasEdge,
  CanvasEditableNode,
  CanvasNode,
} from '@/features/canvas/model/types'
import type { RecipeStepKind } from '../types'

const steps: RecipeStepKind[] = [
  'layers',
  'traversal',
  'filters',
  'grouping',
  'style',
  'layout',
]

function createNode(overrides: Partial<CanvasEditableNode> = {}): CanvasNode {
  return {
    id: 'provider',
    kind: 'editable',
    shape: 'box',
    layoutMode: 'auto',
    appLabel: 'cloud',
    modelName: 'provider',
    x: 0,
    y: 0,
    width: 180,
    height: 96,
    lexicalJson: '{}',
    html: '<p>Provider</p>',
    contentHeight: 0,
    version: 1,
    ...overrides,
  }
}

function createEdge(overrides: Partial<CanvasEdge> = {}): CanvasEdge {
  return {
    id: 'provider-region',
    sourceNodeId: 'provider',
    targetNodeId: 'region',
    kind: 'default',
    label: 'regions',
    ...overrides,
  }
}

function signature(nodes: CanvasNode[], edges: CanvasEdge[] = [createEdge()]) {
  return getBuilderPreviewRelayoutSignature({
    edges,
    layoutAlgorithm: 'Layered',
    layoutDirection: 'LR',
    nodes,
  })
}

describe('BuilderPreviewPane progressive preview mode', () => {
  it('keeps layout mode and edge visibility stable across recipe steps', () => {
    expect(steps.map((step) => [step, shouldAutoLayout(step)])).toEqual(
      steps.map((step) => [step, true]),
    )
    expect(steps.map((step) => [step, shouldShowEdges(step)])).toEqual(
      steps.map((step) => [step, true]),
    )
  })

  it('does not relayout for content-only node changes', () => {
    const base = signature([createNode()])
    const changedText = signature([
      createNode({ html: '<p>Renamed</p>', lexicalJson: '{"text":"Renamed"}' }),
    ])
    const changedColor = signature([
      createNode({ styleOverrides: { backgroundColor: '#111111' } }),
    ])

    expect(changedText).toBe(base)
    expect(changedColor).toBe(base)
  })

  it('relayouts for geometry and path changes', () => {
    const base = signature([createNode(), createNode({ id: 'region' })])
    const resized = signature([
      createNode({ width: 240 }),
      createNode({ id: 'region' }),
    ])
    const changedPath = signature(
      [createNode(), createNode({ id: 'region' })],
      [createEdge({ label: 'networks -> region' })],
    )

    expect(resized).not.toBe(base)
    expect(changedPath).not.toBe(base)
  })
})
