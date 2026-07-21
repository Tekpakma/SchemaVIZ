import { describe, expect, it } from 'vitest'

import type { ModelInfoShort, RelationInfo } from '@/api/contracts'
import {
  getExplorerSourceModels,
  groupRelatedExplorerModels,
  indexExplorerModels,
} from './modelExplorer'

function schemaModel(
  appLabel: string,
  modelName: string,
  verboseName = modelName,
): ModelInfoShort {
  return {
    abstract: false,
    appLabel,
    appVerboseName: appLabel,
    dbTable: `${appLabel}_${modelName}`,
    managed: true,
    modelName,
    verboseName,
    verboseNamePlural: `${verboseName}s`,
  }
}

function relation(
  relatedModel: string,
  name: string,
  reverse = false,
): RelationInfo {
  return {
    name,
    relatedModel,
    relatedName: '',
    reverse,
    type: reverse ? 'ManyToOneRel' : 'ForeignKey',
  }
}

describe('model explorer helpers', () => {
  it('groups multiple relations to the same accessible model', () => {
    const server = schemaModel('infra', 'server', 'Server')
    const environment = schemaModel('infra', 'environment', 'Environment')
    const result = groupRelatedExplorerModels(
      [
        relation('infra.environment', 'environment'),
        relation('infra.environment', 'servers', true),
        relation('private.secret', 'secret'),
      ],
      indexExplorerModels([server, environment]),
    )

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      modelId: 'infra.environment',
      relations: [
        { direction: 'forward', name: 'environment' },
        { direction: 'reverse', name: 'servers' },
      ],
    })
  })

  it('uses the closest populated predecessor as explorer source', () => {
    const layers = [
      { id: 'l1', label: 'L1' },
      { id: 'l2', label: 'L2' },
      { id: 'l3', label: 'L3' },
    ]
    const models = [
      {
        id: 'start',
        appLabel: 'infra',
        appVerboseName: 'Infrastructure',
        modelName: 'businessgroup',
        modelId: 'infra.businessgroup',
        displayName: 'Business group',
        layerId: 'l1',
      },
      {
        id: 'server',
        appLabel: 'infra',
        appVerboseName: 'Infrastructure',
        modelName: 'server',
        modelId: 'infra.server',
        displayName: 'Server',
        layerId: 'l1',
      },
    ]

    expect(getExplorerSourceModels(layers, models, 'l3')).toHaveLength(2)
    expect(getExplorerSourceModels(layers, models, null)).toHaveLength(2)
    expect(getExplorerSourceModels(layers, models, 'l1')).toEqual([])
  })

  it('prefers models in the immediately preceding populated layer', () => {
    const layers = [
      { id: 'l1', label: 'L1' },
      { id: 'l2', label: 'L2' },
      { id: 'l3', label: 'L3' },
    ]
    const models = [
      {
        id: 'start',
        appLabel: 'infra',
        appVerboseName: 'Infrastructure',
        modelName: 'businessgroup',
        modelId: 'infra.businessgroup',
        displayName: 'Business group',
        layerId: 'l1',
      },
      {
        id: 'environment',
        appLabel: 'infra',
        appVerboseName: 'Infrastructure',
        modelName: 'environment',
        modelId: 'infra.environment',
        displayName: 'Environment',
        layerId: 'l2',
      },
    ]

    expect(getExplorerSourceModels(layers, models, 'l3')).toEqual([models[1]])
  })
})
