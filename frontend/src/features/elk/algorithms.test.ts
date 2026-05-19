import { describe, expect, it } from 'vitest'

import {
  getBuilderPreviewFlowDirection,
  getBuilderPreviewLayoutOptions,
} from './algorithms'

describe('ELK algorithm presets', () => {
  it('uses the selected algorithm for builder preview layout', () => {
    expect(getBuilderPreviewLayoutOptions('Layered')['elk.algorithm']).toBe(
      'layered',
    )
    expect(getBuilderPreviewLayoutOptions('Tree')['elk.algorithm']).toBe(
      'mrtree',
    )
    expect(getBuilderPreviewLayoutOptions('Force')['elk.algorithm']).toBe(
      'force',
    )
    expect(getBuilderPreviewLayoutOptions('Radial')['elk.algorithm']).toBe(
      'radial',
    )
  })

  it('uses the selected preview direction for ELK flow and edge ports', () => {
    expect(getBuilderPreviewFlowDirection('LR')).toBe('LR')
    expect(getBuilderPreviewFlowDirection('TB')).toBe('TB')
    expect(getBuilderPreviewFlowDirection('RL')).toBe('RL')
    expect(getBuilderPreviewFlowDirection('BT')).toBe('BT')
  })
})
