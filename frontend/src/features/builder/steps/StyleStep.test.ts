import { describe, expect, it } from 'vitest'

import type { StyleTemplate } from '@/api/contracts'
import { createTemplateTextContent } from '@/features/lexical/templateTextContent'
import type { RecipeModel, RecipeStyleDraft, TraversalEdge } from '../types'
import {
  getGroupingEdgesForStyleSelection,
  getStyleSelectionContext,
  resolveStyleDraftForModelInitialization,
} from './StyleStep'

const model: RecipeModel = {
  id: 'business-group',
  appLabel: 'infrastructure',
  appVerboseName: 'Infrastructure',
  displayName: 'Business group',
  layerId: 'layer-business-group',
  modelId: 'infrastructure.BusinessGroup',
  modelName: 'BusinessGroup',
  styleTemplateId: 'style-business-group',
}

function createStyleTemplate(overrides: Partial<StyleTemplate> = {}) {
  return {
    id: 'style-business-group',
    name: 'Business group template',
    textContent: createTemplateTextContent('Styled business group'),
    visualStyles: { color: '#111111' },
    dimensions: { width: 240, height: 120 },
    typeSpecificData: { shapeKey: 'default' },
    ...overrides,
  } as StyleTemplate
}

describe('StyleStep style draft initialization', () => {
  it('hydrates a missing draft from the selected style template', () => {
    const draft = resolveStyleDraftForModelInitialization({
      existingDraft: undefined,
      model,
      templates: [createStyleTemplate()],
      templatesPending: false,
    })

    expect(draft).toMatchObject({
      sourceTemplateId: 'style-business-group',
      textContent: createTemplateTextContent('Styled business group'),
      visualStyles: { color: '#111111' },
      dimensions: { width: 240, height: 120 },
      typeSpecificData: { shapeKey: 'default' },
      dirty: false,
    })
  })

  it('does not replace an existing persisted draft', () => {
    const existingDraft: RecipeStyleDraft = {
      sourceTemplateId: null,
      persistedTemplateId: 'persisted-draft',
      name: 'Persisted node edit',
      textContent: createTemplateTextContent('Persisted node text'),
      visualStyles: {},
      dimensions: { width: 180 },
      typeSpecificData: {},
      dirty: false,
      saveState: 'idle',
    }

    expect(
      resolveStyleDraftForModelInitialization({
        existingDraft,
        model,
        templates: [createStyleTemplate()],
        templatesPending: false,
      }),
    ).toBeNull()
  })

  it('waits for style templates before falling back to quick style', () => {
    expect(
      resolveStyleDraftForModelInitialization({
        existingDraft: undefined,
        model,
        templates: [],
        templatesPending: true,
      }),
    ).toBeNull()
  })
})

describe('StyleStep selection context', () => {
  it('maps promoted group node selection back to the source model', () => {
    expect(
      getStyleSelectionContext({
        models: [model],
        selectedCanvasNodeId: 'builder-model-group:business-group',
      }),
    ).toEqual({
      kind: 'group',
      model,
    })
  })

  it('keeps normal model node selection separate from group selection', () => {
    expect(
      getStyleSelectionContext({
        models: [model],
        selectedCanvasNodeId: 'business-group',
      }),
    ).toEqual({
      kind: 'model',
      model,
    })
  })

  it('shows all grouping controls before a node is selected', () => {
    const edges: TraversalEdge[] = [
      {
        id: 'business-to-provider',
        from: 'business group',
        to: 'cloud provider',
        fromModelId: 'business-group',
        toModelId: 'cloud-provider',
        via: 'networks -> region -> provider',
        auto: true,
        cost: 1,
      },
      {
        id: 'provider-to-region',
        from: 'cloud provider',
        to: 'region',
        fromModelId: 'cloud-provider',
        toModelId: 'region',
        via: 'regions',
        auto: true,
        cost: 1,
      },
    ]

    expect(
      getGroupingEdgesForStyleSelection({
        edges,
        selectionContext: { kind: 'none', model: null },
      }),
    ).toEqual(edges)
  })

  it('limits group selection controls to relations owned by the selected group', () => {
    const edges: TraversalEdge[] = [
      {
        id: 'business-to-provider',
        from: 'business group',
        to: 'cloud provider',
        fromModelId: 'business-group',
        toModelId: 'cloud-provider',
        via: 'networks -> region -> provider',
        auto: true,
        cost: 1,
      },
      {
        id: 'provider-to-region',
        from: 'cloud provider',
        to: 'region',
        fromModelId: 'cloud-provider',
        toModelId: 'region',
        via: 'regions',
        auto: true,
        cost: 1,
      },
    ]

    expect(
      getGroupingEdgesForStyleSelection({
        edges,
        selectionContext: { kind: 'group', model },
      }),
    ).toEqual([edges[0]])
  })

  it('shows incident grouping controls for a selected normal model node', () => {
    const cloudProvider: RecipeModel = {
      ...model,
      id: 'cloud-provider',
      displayName: 'Cloud provider',
      modelId: 'infrastructure.CloudProvider',
      modelName: 'CloudProvider',
    }
    const edges: TraversalEdge[] = [
      {
        id: 'business-to-provider',
        from: 'business group',
        to: 'cloud provider',
        fromModelId: 'business-group',
        toModelId: 'cloud-provider',
        via: 'networks -> region -> provider',
        auto: true,
        cost: 1,
      },
      {
        id: 'region-to-zone',
        from: 'region',
        to: 'zone',
        fromModelId: 'region',
        toModelId: 'zone',
        via: 'zones',
        auto: true,
        cost: 1,
      },
    ]

    expect(
      getGroupingEdgesForStyleSelection({
        edges,
        selectionContext: { kind: 'model', model: cloudProvider },
      }),
    ).toEqual([edges[0]])
  })
})
