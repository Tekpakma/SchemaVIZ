import { describe, expect, it } from 'vitest'

import type { InlineGenerationSource } from './templateRecipe'
import { GENERATION_PREVIEW_QUERIES } from './generationPreviewQuery'

function textContent(text: string) {
  return {
    root: {
      children: [
        {
          children: [
            {
              detail: 0,
              format: 0,
              mode: 'normal',
              style: '',
              text,
              type: 'text',
              version: 1,
            },
          ],
          direction: null,
          format: '',
          indent: 0,
          type: 'paragraph',
          version: 1,
        },
      ],
      direction: null,
      format: '',
      indent: 0,
      type: 'root',
      version: 1,
    },
  }
}

function makeSource(text: string): InlineGenerationSource {
  return {
    inlineDefinition: {
      rootStepId: 'provider',
      stepsById: {
        provider: {
          id: 'provider',
          parentId: null,
          childIds: [],
          relationship: null,
          resolvedModelId: 'infrastructure.CloudProvider',
          visibility: 'visible',
          groupMode: 'none',
          styleTemplateId: null,
          label: 'cloud provider',
          filter: null,
        },
      },
    },
    rootModel: 'infrastructure.CloudProvider',
    layoutSettings: {
      layoutAlgorithm: 'Layered',
      layoutDirection: 'LR',
      swatches: ['#C4006A'],
      styleDrafts: {
        provider: {
          name: 'Provider node',
          textContent: textContent(text),
        },
      },
    } as InlineGenerationSource['layoutSettings'],
  }
}

describe('GENERATION_PREVIEW_QUERIES', () => {
  it('keys live preview queries by layout settings so lexical draft edits refetch', () => {
    const first = GENERATION_PREVIEW_QUERIES.run(
      makeSource('{{name}}'),
      '21',
    ).queryKey
    const second = GENERATION_PREVIEW_QUERIES.run(
      makeSource('{{templates.name}}'),
      '21',
    ).queryKey

    expect(second).not.toEqual(first)
    expect(second.at(-1)).toContain('templates.name')
  })
})
