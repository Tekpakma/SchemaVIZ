import { describe, expect, it } from 'vitest'

import { createBlankRecipe } from '@/features/builder/templateRecipe'
import type { RecipeData } from '@/features/builder/types'

import { buildDiagramSnapshot } from './assistantState'
import { createBuilderClientTools } from './builderClientTools'
import type { BuilderToolBridge } from './builderClientTools'

/**
 * Minimal in-memory stand-in for the builder store that mirrors its layer
 * rule: the first layer holds exactly one model.
 */
function createFakeBuilder(initial?: RecipeData) {
  let recipe = initial ?? createBlankRecipe()
  const calls: Array<string> = []

  const bridge: BuilderToolBridge = {
    getRecipe: () => structuredClone(recipe),
    actions: {
      addEdge: (edge) => {
        calls.push('addEdge')
        recipe = { ...recipe, edges: [...recipe.edges, edge] }
      },
      addExample: (example) => {
        calls.push('addExample')
        recipe = { ...recipe, examples: [...recipe.examples, example] }
      },
      addGroupRule: (rule) => {
        calls.push('addGroupRule')
        recipe = { ...recipe, groupRules: [...recipe.groupRules, rule] }
      },
      addLayer: (layer) => {
        calls.push('addLayer')
        recipe = { ...recipe, layers: [...recipe.layers, layer] }
      },
      addModel: (model) => {
        calls.push('addModel')
        const startLayerId = recipe.layers[0]!.id
        if (
          model.layerId === startLayerId &&
          recipe.models.some((m) => m.layerId === startLayerId)
        ) {
          return
        }
        recipe = { ...recipe, models: [...recipe.models, model] }
      },
      removeModel: (id) => {
        calls.push('removeModel')
        recipe = {
          ...recipe,
          models: recipe.models.filter((m) => m.id !== id),
          edges: recipe.edges.filter(
            (e) => e.fromModelId !== id && e.toModelId !== id,
          ),
        }
      },
      setActiveExample: (id) => {
        calls.push(`setActiveExample:${id}`)
      },
      setEdgeLabels: (mode) => {
        calls.push('setEdgeLabels')
        recipe = { ...recipe, edgeLabels: mode }
      },
      setLayoutDirection: (direction) => {
        calls.push('setLayoutDirection')
        recipe = { ...recipe, layoutDirection: direction }
      },
      setStyleDraft: (modelId, draft) => {
        calls.push('setStyleDraft')
        recipe = {
          ...recipe,
          styleDrafts: { ...recipe.styleDrafts, [modelId]: draft },
        }
      },
      setTitle: (title) => {
        calls.push('setTitle')
        recipe = { ...recipe, title }
      },
    },
  }

  return { bridge, calls, current: () => recipe }
}

const spec = {
  title: 'Retail landscape',
  rootModel: 'infrastructure.BusinessGroup',
  steps: [
    {
      fromModel: 'infrastructure.BusinessGroup',
      toModel: 'infrastructure.Application',
      relationship: 'applications',
    },
    {
      fromModel: 'infrastructure.Application',
      toModel: 'infrastructure.Server',
      relationship: 'servers',
    },
    {
      fromModel: 'infrastructure.Application',
      toModel: 'infrastructure.Person',
      relationship: 'owner',
    },
  ],
  layoutDirection: 'TB' as const,
}

function tool(bridge: BuilderToolBridge, name: string) {
  const found = createBuilderClientTools(bridge).find((t) => t.name === name)
  if (!found?.execute) throw new Error(`missing tool ${name}`)
  return found.execute as (args: unknown) => unknown
}

describe('applyDiagramSpec', () => {
  it('places models by hop depth into layers and wires edges by builder id', () => {
    const builder = createFakeBuilder()

    const result = tool(builder.bridge, 'applyDiagramSpec')({ spec })

    const recipe = builder.current()
    expect(result).toEqual({
      modelCount: 4,
      edgeCount: 3,
      addedModels: [
        'infrastructure.BusinessGroup',
        'infrastructure.Application',
        'infrastructure.Server',
        'infrastructure.Person',
      ],
    })
    expect(recipe.title).toBe('Retail landscape')
    expect(recipe.layoutDirection).toBe('TB')

    // Root first, then one layer per depth.
    expect(recipe.models[0]!.modelId).toBe('infrastructure.BusinessGroup')
    expect(recipe.layers).toHaveLength(3)
    const layerOf = (modelId: string) =>
      recipe.layers.findIndex(
        (layer) =>
          layer.id ===
          recipe.models.find((m) => m.modelId === modelId)!.layerId,
      )
    expect(layerOf('infrastructure.BusinessGroup')).toBe(0)
    expect(layerOf('infrastructure.Application')).toBe(1)
    expect(layerOf('infrastructure.Server')).toBe(2)
    expect(layerOf('infrastructure.Person')).toBe(2)

    // Edges reference builder ids, not schema ids, so the preview resolves them.
    const app = recipe.models.find(
      (m) => m.modelId === 'infrastructure.Application',
    )!
    expect(app.id).toMatch(/^model-/)
    expect(recipe.edges.map((e) => [e.fromModelId, e.via])).toContainEqual([
      app.id,
      'servers',
    ])
  })

  it('replaces the previous diagram by default and merges on request', () => {
    const builder = createFakeBuilder()
    tool(builder.bridge, 'applyDiagramSpec')({ spec })

    tool(
      builder.bridge,
      'applyDiagramSpec',
    )({
      spec: {
        ...spec,
        steps: spec.steps.slice(0, 1),
        title: 'Only applications',
      },
    })
    expect(builder.current().models.map((m) => m.modelId)).toEqual([
      'infrastructure.BusinessGroup',
      'infrastructure.Application',
    ])
    expect(builder.current().title).toBe('Only applications')

    const merged = tool(
      builder.bridge,
      'applyDiagramSpec',
    )({
      spec,
      mode: 'merge',
    }) as { addedModels: Array<string>; edgeCount: number }
    expect(merged.addedModels).toEqual([
      'infrastructure.Server',
      'infrastructure.Person',
    ])
    expect(merged.edgeCount).toBe(3)
    // Merge keeps the user's title.
    expect(builder.current().title).toBe('Only applications')
  })

  it('refuses to merge a spec with a different root', () => {
    const builder = createFakeBuilder()
    tool(builder.bridge, 'applyDiagramSpec')({ spec })

    expect(() =>
      tool(
        builder.bridge,
        'applyDiagramSpec',
      )({
        spec: { ...spec, rootModel: 'infrastructure.Server', steps: [] },
        mode: 'merge',
      }),
    ).toThrow(/rooted at infrastructure.BusinessGroup/)
  })

  it('turns group steps into rules, styles every model and sets edge labels', () => {
    const builder = createFakeBuilder()

    tool(
      builder.bridge,
      'applyDiagramSpec',
    )({
      spec: {
        ...spec,
        steps: spec.steps.map((step, index) => ({
          ...step,
          groupMode: index === 0 ? 'group' : 'edge',
        })),
        styles: {
          'infrastructure.Server': {
            shape: 'server',
            color: '#123456',
            fields: ['hostname'],
          },
        },
        edgeLabels: 'none',
      },
    })

    const recipe = builder.current()
    const byModelId = new Map(recipe.models.map((m) => [m.modelId, m]))
    expect(recipe.groupRules).toEqual([
      expect.objectContaining({
        parentModelId: byModelId.get('infrastructure.BusinessGroup')!.id,
        childModelId: byModelId.get('infrastructure.Application')!.id,
        via: 'applications',
        mode: 'group',
      }),
    ])
    expect(recipe.edgeLabels).toBe('none')

    const server =
      recipe.styleDrafts[byModelId.get('infrastructure.Server')!.id]!
    expect(server.typeSpecificData).toEqual({
      shapeKey: 'server',
      accent: '#123456',
      borderColor: '#123456',
    })
    expect(JSON.stringify(server.textContent)).toContain('{{hostname}}')

    // Unstyled models still get a guessed shape and a stable colour.
    const person =
      recipe.styleDrafts[byModelId.get('infrastructure.Person')!.id]!
    expect(person.typeSpecificData).toMatchObject({ shapeKey: 'person' })
    expect(Object.keys(recipe.styleDrafts)).toHaveLength(4)
  })
})

describe('removeModels and setRootRecord', () => {
  it('removes by schema id and reports unknown ids', () => {
    const builder = createFakeBuilder()
    tool(builder.bridge, 'applyDiagramSpec')({ spec })

    const result = tool(
      builder.bridge,
      'removeModels',
    )({
      modelIds: ['infrastructure.Person', 'audit.AuditLog'],
    })

    expect(result).toEqual({
      removed: ['infrastructure.Person'],
      notFound: ['audit.AuditLog'],
    })
    expect(builder.current().edges).toHaveLength(2)
  })

  it('pins the record as an example of the root model and activates it', () => {
    const builder = createFakeBuilder()
    tool(builder.bridge, 'applyDiagramSpec')({ spec })

    const result = tool(
      builder.bridge,
      'setRootRecord',
    )({
      recordId: '42',
      label: 'Retail',
    })

    expect(result).toEqual({
      rootModel: 'infrastructure.BusinessGroup',
      recordId: '42',
    })
    expect(builder.current().examples).toEqual([
      expect.objectContaining({
        idValue: 'infrastructure:42',
        label: 'Retail',
        isDefault: true,
      }),
    ])
    expect(builder.calls.at(-1)).toBe('setActiveExample:ex-BusinessGroup-42')

    // A second call reuses the pinned example instead of duplicating it.
    tool(builder.bridge, 'setRootRecord')({ recordId: '42', label: 'Retail' })
    expect(builder.current().examples).toHaveLength(1)
  })

  it('needs a root model before a record can be shown', () => {
    const builder = createFakeBuilder()
    expect(() =>
      tool(builder.bridge, 'setRootRecord')({ recordId: '1', label: 'x' }),
    ).toThrow(/no root model/)
  })
})

describe('buildDiagramSnapshot', () => {
  it('describes the canvas in schema ids with the live record', () => {
    const builder = createFakeBuilder()
    tool(builder.bridge, 'applyDiagramSpec')({ spec })
    tool(builder.bridge, 'setRootRecord')({ recordId: '42', label: 'Retail' })

    const snapshot = buildDiagramSnapshot(
      builder.current(),
      'ex-BusinessGroup-42',
    )

    expect(snapshot).toEqual({
      title: 'Retail landscape',
      rootModel: 'infrastructure.BusinessGroup',
      models: [
        'infrastructure.BusinessGroup',
        'infrastructure.Application',
        'infrastructure.Server',
        'infrastructure.Person',
      ],
      edges: [
        {
          from: 'infrastructure.BusinessGroup',
          to: 'infrastructure.Application',
          via: 'applications',
        },
        {
          from: 'infrastructure.Application',
          to: 'infrastructure.Server',
          via: 'servers',
        },
        {
          from: 'infrastructure.Application',
          to: 'infrastructure.Person',
          via: 'owner',
        },
      ],
      layoutDirection: 'TB',
      activeRecord: { id: '42', label: 'Retail' },
    })
  })
})
