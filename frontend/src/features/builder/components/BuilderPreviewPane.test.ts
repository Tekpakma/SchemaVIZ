import { describe, expect, it } from 'vitest'

import { shouldAutoLayout } from './BuilderPreviewPane'
import type { RecipeStepKind } from '../types'

describe('BuilderPreviewPane step layout mode', () => {
  it('uses auto layout for style and layout steps so grouped nodes are available', () => {
    const autoLayoutSteps: RecipeStepKind[] = ['style', 'layout']
    const staticSteps: RecipeStepKind[] = [
      'layers',
      'traversal',
      'filters',
      'grouping',
    ]

    expect(autoLayoutSteps.map((step) => [step, shouldAutoLayout(step)]))
      .toEqual([
        ['style', true],
        ['layout', true],
      ])
    expect(staticSteps.map((step) => [step, shouldAutoLayout(step)])).toEqual([
      ['layers', false],
      ['traversal', false],
      ['filters', false],
      ['grouping', false],
    ])
  })
})
