import { beforeEach, describe, expect, it } from 'vitest'

import {
  getBuilderActionsSnapshot,
  getBuilderActiveStepIndexSnapshot,
  getBuilderRecipeSnapshot,
  resetBuilderStoreForTests,
} from './builderStore'
import {
  getActiveWorkbenchTabIdSnapshot,
  getWorkbenchActionsSnapshot,
  getWorkbenchTabsSnapshot,
  resetWorkbenchStoreForTests,
} from './workbenchStore'
import {
  openDefaultBuilderDraftTab,
  openBuilderTabFromIntent,
  seedBuilderDocumentForTab,
  setBuilderDocumentTitle,
} from '@/features/builder/builderWorkbench'
import type { GenerationTemplateRead } from '@/api/contracts'

function createTemplate(
  overrides: Partial<GenerationTemplateRead> = {},
): GenerationTemplateRead {
  return {
    id: '018f3b2e-8a9a-7c6d-9e0f-123456789abc',
    name: 'Cloud overview',
    description: '',
    rootModel: 'cloud.Provider',
    scope: 'owner',
    ownedByCurrentUser: true,
    featured: {
      enabled: false,
      rank: null,
    },
    shareSlug: null,
    draftVersion: null,
    publishedVersion: null,
    publishedAt: null,
    publishedBy: null,
    createdAt: '2026-05-13T12:00:00+00:00',
    updatedAt: '2026-05-13T12:00:00+00:00',
    ...overrides,
  }
}

describe('builderStore workbench documents', () => {
  beforeEach(() => {
    resetWorkbenchStoreForTests()
    resetBuilderStoreForTests()
  })

  it('keeps builder documents isolated by workbench tab id', () => {
    const workbenchActions = getWorkbenchActionsSnapshot()
    const builderActions = getBuilderActionsSnapshot()

    const firstTabId = workbenchActions.openTab({
      kind: 'generation-builder',
      title: 'First',
      resource: {
        type: 'draft',
        localId: 'first',
      },
    })
    builderActions.ensureDocument(firstTabId)
    builderActions.setTitle(firstTabId, 'First recipe')
    builderActions.addLayer(firstTabId, {
      id: 'layer-1',
      label: 'Layer 1',
    })
    builderActions.addModel(firstTabId, {
      id: 'model-1',
      appLabel: 'app',
      appVerboseName: 'App',
      modelName: 'first',
      modelId: 'app.first',
      displayName: 'First',
      layerId: 'layer-1',
    })
    builderActions.setSwatch(firstTabId, 0, '#111111')
    builderActions.setActiveStep(firstTabId, 2)

    const secondTabId = workbenchActions.openTab({
      kind: 'generation-builder',
      title: 'Second',
      resource: {
        type: 'draft',
        localId: 'second',
      },
    })
    builderActions.ensureDocument(secondTabId)
    builderActions.setTitle(secondTabId, 'Second recipe')
    builderActions.addFilter(secondTabId, {
      id: 'filter-1',
      layer: 'Layer 2',
      expr: 'status=active',
      suggested: true,
    })
    builderActions.setLayoutAlgorithm(secondTabId, 'Force')

    expect(getBuilderRecipeSnapshot(secondTabId)).toMatchObject({
      title: 'Second recipe',
      filters: [
        {
          id: 'filter-1',
        },
      ],
      layoutAlgorithm: 'Force',
    })
    expect(getBuilderActiveStepIndexSnapshot(secondTabId)).toBe(0)

    workbenchActions.switchTab(firstTabId)
    const firstRecipe = getBuilderRecipeSnapshot(firstTabId)
    expect(firstRecipe).toMatchObject({
      title: 'First recipe',
      models: [
        {
          id: 'model-1',
          layerId: 'layer-1',
        },
      ],
      swatches: ['#111111', '#1D8B68', '#6A2B4D', '#18181B'],
    })
    expect(firstRecipe?.layers).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'layer-1' })]),
    )
    expect(getBuilderActiveStepIndexSnapshot(firstTabId)).toBe(2)

    workbenchActions.switchTab(secondTabId)
    expect(getBuilderRecipeSnapshot(secondTabId)).toMatchObject({
      title: 'Second recipe',
      models: [],
      filters: [
        {
          id: 'filter-1',
        },
      ],
    })
    expect(getBuilderRecipeSnapshot(secondTabId)?.layers).toHaveLength(1)
  })

  it('keeps document mutations independent from workbench tab metadata', () => {
    const tabId = getWorkbenchActionsSnapshot().openTab({
      kind: 'generation-builder',
      title: 'Draft',
      resource: {
        type: 'draft',
        localId: 'dirty-draft',
      },
    })

    getBuilderActionsSnapshot().ensureDocument(tabId)
    getBuilderActionsSnapshot().setTitle(tabId, 'Document title')

    expect(getWorkbenchTabsSnapshot()).toMatchObject([
      {
        id: tabId,
        title: 'Draft',
        dirty: false,
      },
    ])
  })

  it('reorders layers inside one builder document', () => {
    const tabId = getWorkbenchActionsSnapshot().openTab({
      kind: 'generation-builder',
      title: 'Sortable layers',
      resource: {
        type: 'draft',
        localId: 'sortable-layers',
      },
    })
    const builderActions = getBuilderActionsSnapshot()

    builderActions.addLayer(tabId, {
      id: 'layer-1',
      label: 'Layer 1',
    })
    builderActions.addLayer(tabId, {
      id: 'layer-2',
      label: 'Layer 2',
    })
    builderActions.addLayer(tabId, {
      id: 'layer-3',
      label: 'Layer 3',
    })
    builderActions.reorderLayers(tabId, [
      {
        id: 'layer-2',
        label: 'Layer 2',
      },
      {
        id: 'layer-3',
        label: 'Layer 3',
      },
      {
        id: 'layer-1',
        label: 'Layer 1',
      },
    ])

    expect(getBuilderRecipeSnapshot(tabId)?.layers).toMatchObject([
      {
        id: 'layer-2',
      },
      {
        id: 'layer-3',
      },
      {
        id: 'layer-1',
      },
    ])
  })

  it('keeps backend models separate from visual layers', () => {
    const tabId = getWorkbenchActionsSnapshot().openTab({
      kind: 'generation-builder',
      title: 'Model lanes',
      resource: {
        type: 'draft',
        localId: 'model-lanes',
      },
    })
    const builderActions = getBuilderActionsSnapshot()

    builderActions.addLayer(tabId, {
      id: 'layer-app',
      label: 'Application',
    })
    builderActions.addModel(tabId, {
      id: 'model-service',
      appLabel: 'catalog',
      appVerboseName: 'Catalog',
      modelName: 'service',
      modelId: 'catalog.service',
      displayName: 'Service',
      layerId: 'layer-app',
    })
    builderActions.addModel(tabId, {
      id: 'model-database',
      appLabel: 'catalog',
      appVerboseName: 'Catalog',
      modelName: 'database',
      modelId: 'catalog.database',
      displayName: 'Database',
      layerId: 'layer-app',
    })
    builderActions.reorderModels(tabId, [
      {
        id: 'model-database',
        appLabel: 'catalog',
        appVerboseName: 'Catalog',
        modelName: 'database',
        modelId: 'catalog.database',
        displayName: 'Database',
        layerId: 'layer-app',
      },
      {
        id: 'model-service',
        appLabel: 'catalog',
        appVerboseName: 'Catalog',
        modelName: 'service',
        modelId: 'catalog.service',
        displayName: 'Service',
        layerId: 'layer-app',
      },
    ])

    const recipe = getBuilderRecipeSnapshot(tabId)
    expect(recipe).toMatchObject({
      models: [
        {
          id: 'model-database',
          layerId: 'layer-app',
        },
        {
          id: 'model-service',
          layerId: 'layer-app',
        },
      ],
    })
    expect(recipe?.layers).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'layer-app' })]),
    )
  })

  it('keeps the first layer limited to one start model', () => {
    const tabId = getWorkbenchActionsSnapshot().openTab({
      kind: 'generation-builder',
      title: 'Start lane',
      resource: {
        type: 'draft',
        localId: 'start-lane',
      },
    })
    const builderActions = getBuilderActionsSnapshot()
    builderActions.ensureDocument(tabId)
    const startLayerId = getBuilderRecipeSnapshot(tabId)!.layers[0]!.id

    builderActions.addModel(tabId, {
      id: 'model-environment',
      appLabel: 'infrastructure',
      appVerboseName: 'Infrastructure',
      modelName: 'environment',
      modelId: 'infrastructure.environment',
      displayName: 'Environment',
      layerId: startLayerId,
    })
    builderActions.addModel(tabId, {
      id: 'model-datacenter',
      appLabel: 'infrastructure',
      appVerboseName: 'Infrastructure',
      modelName: 'datacenter',
      modelId: 'infrastructure.datacenter',
      displayName: 'Datacenter',
      layerId: startLayerId,
    })

    expect(
      getBuilderRecipeSnapshot(tabId)?.models.filter(
        (model) => model.layerId === startLayerId,
      ),
    ).toMatchObject([
      {
        id: 'model-environment',
      },
    ])

    builderActions.addLayer(tabId, {
      id: 'layer-2',
      label: 'L2',
    })
    builderActions.addModel(tabId, {
      id: 'model-rack',
      appLabel: 'infrastructure',
      appVerboseName: 'Infrastructure',
      modelName: 'rack',
      modelId: 'infrastructure.rack',
      displayName: 'Rack',
      layerId: 'layer-2',
    })
    builderActions.setModelLayer(tabId, 'model-rack', startLayerId)

    expect(getBuilderRecipeSnapshot(tabId)?.models).toMatchObject([
      {
        id: 'model-environment',
        layerId: startLayerId,
      },
      {
        id: 'model-rack',
        layerId: 'layer-2',
      },
    ])
  })

  it('moves overflow seeded start models into a secondary layer', () => {
    const tabId = getWorkbenchActionsSnapshot().openTab({
      kind: 'generation-builder',
      title: 'Seeded start lane',
      resource: {
        type: 'draft',
        localId: 'seeded-start-lane',
      },
    })

    seedBuilderDocumentForTab(tabId, {
      title: 'Seeded start lane',
      layers: [
        {
          id: 'layer-start',
          label: 'L1',
        },
      ],
      models: [
        {
          id: 'model-environment',
          appLabel: 'infrastructure',
          appVerboseName: 'Infrastructure',
          modelName: 'environment',
          modelId: 'infrastructure.environment',
          displayName: 'Environment',
          layerId: 'layer-start',
        },
        {
          id: 'model-datacenter',
          appLabel: 'infrastructure',
          appVerboseName: 'Infrastructure',
          modelName: 'datacenter',
          modelId: 'infrastructure.datacenter',
          displayName: 'Datacenter',
          layerId: 'layer-start',
        },
      ],
      examples: [],
      edges: [],
      filters: [],
      groupRules: [],
      swatches: ['#000000'],
      layoutAlgorithm: 'Tree',
      promoteOrg: '',
      promoteVisibility: 'private',
      promoteAudience: '',
    })

    const recipe = getBuilderRecipeSnapshot(tabId)
    expect(recipe?.layers).toHaveLength(2)
    expect(recipe?.models).toMatchObject([
      {
        id: 'model-environment',
        layerId: 'layer-start',
      },
      {
        id: 'model-datacenter',
        layerId: recipe!.layers[1]!.id,
      },
    ])
  })

  it('normalizes seeded recipes to keep at least one layer', () => {
    const tabId = getWorkbenchActionsSnapshot().openTab({
      kind: 'generation-builder',
      title: 'Seed target',
      resource: {
        type: 'draft',
        localId: 'empty-layer-seed-target',
      },
    })

    seedBuilderDocumentForTab(tabId, {
      title: 'Empty layer seed',
      layers: [],
      models: [],
      examples: [],
      edges: [],
      filters: [],
      groupRules: [],
      swatches: ['#000000'],
      layoutAlgorithm: 'Tree',
      promoteOrg: '',
      promoteVisibility: 'private',
      promoteAudience: '',
    })

    expect(getBuilderRecipeSnapshot(tabId)?.layers).toMatchObject([
      {
        label: 'L1',
      },
    ])
  })

  it('updates workbench title and dirty state through builder workbench commands', () => {
    const tabId = getWorkbenchActionsSnapshot().openTab({
      kind: 'generation-builder',
      title: 'Draft',
      resource: {
        type: 'draft',
        localId: 'dirty-draft',
      },
    })

    getBuilderActionsSnapshot().ensureDocument(tabId)
    setBuilderDocumentTitle(tabId, 'Dirty draft')

    expect(getBuilderRecipeSnapshot(tabId)).toMatchObject({
      title: 'Dirty draft',
    })
    expect(getWorkbenchTabsSnapshot()).toMatchObject([
      {
        id: tabId,
        title: 'Dirty draft',
        dirty: true,
      },
    ])
  })

  it('opens or activates the default builder draft for the builder route', () => {
    const firstTabId = openDefaultBuilderDraftTab()
    getBuilderActionsSnapshot().setTitle(firstTabId, 'Route draft')

    const secondTabId = openDefaultBuilderDraftTab()

    expect(secondTabId).toBe(firstTabId)
    expect(getActiveWorkbenchTabIdSnapshot()).toBe(firstTabId)
    expect(getWorkbenchTabsSnapshot()).toHaveLength(1)
    expect(getBuilderRecipeSnapshot(firstTabId)?.title).toBe('Route draft')
  })

  it('opens builder tabs from route intents without duplicating existing tabs', () => {
    const template = createTemplate()
    const firstTabId = openBuilderTabFromIntent({
      type: 'template',
      template,
    })
    getBuilderActionsSnapshot().setTitle(firstTabId, 'Edited template')

    const secondTabId = openBuilderTabFromIntent({
      type: 'template',
      template,
    })

    expect(secondTabId).toBe(firstTabId)
    expect(getActiveWorkbenchTabIdSnapshot()).toBe(firstTabId)
    expect(getWorkbenchTabsSnapshot()).toHaveLength(1)
    expect(getBuilderRecipeSnapshot(firstTabId)?.title).toBe('Edited template')
  })

  it('seeds explicit builder documents once', () => {
    const tabId = getWorkbenchActionsSnapshot().openTab({
      kind: 'generation-builder',
      title: 'Seed target',
      resource: {
        type: 'draft',
        localId: 'seed-target',
      },
    })

    seedBuilderDocumentForTab(tabId, {
      title: 'Seeded recipe',
      layers: [
        {
          id: 'layer-1',
          label: 'Layer 1',
        },
      ],
      models: [],
      examples: [],
      edges: [],
      filters: [],
      groupRules: [],
      swatches: ['#000000'],
      layoutAlgorithm: 'Tree',
      promoteOrg: '',
      promoteVisibility: 'private',
      promoteAudience: '',
    })
    seedBuilderDocumentForTab(tabId, {
      title: 'Second seed',
      layers: [],
      models: [],
      examples: [],
      edges: [],
      filters: [],
      groupRules: [],
      swatches: ['#ffffff'],
      layoutAlgorithm: 'Force',
      promoteOrg: '',
      promoteVisibility: 'org-wide',
      promoteAudience: '',
    })

    expect(getBuilderRecipeSnapshot(tabId)).toMatchObject({
      title: 'Seeded recipe',
      layers: [
        {
          id: 'layer-1',
        },
      ],
      swatches: ['#000000'],
      layoutAlgorithm: 'Tree',
    })
    expect(getWorkbenchTabsSnapshot()[0]).toMatchObject({
      id: tabId,
      title: 'Seeded recipe',
      dirty: false,
    })
  })
})
