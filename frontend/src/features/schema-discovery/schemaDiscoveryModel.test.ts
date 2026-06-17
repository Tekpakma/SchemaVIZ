import { describe, expect, it } from 'vitest'

import type { ModelInfo } from '@/api/contracts'
import {
  filterSchemaModels,
  findSchemaModel,
  getSchemaDiscoveryStats,
  getSchemaModelId,
  groupSchemaModelsByApp,
} from './schemaDiscoveryModel'

const models: ModelInfo[] = [
  {
    appLabel: 'inventory',
    appVerboseName: 'Inventory',
    modelName: 'Device',
    verboseName: 'Device',
    verboseNamePlural: 'Devices',
    abstract: false,
    dbTable: 'inventory_device',
    managed: true,
    fields: [{ name: 'hostname', type: 'CharField', verboseName: null }],
    relations: [
      {
        name: 'uplinks',
        type: 'reverse',
        relatedModel: 'network.Interface',
        relatedName: 'device',
        helpText: null,
        verboseName: null,
      },
    ],
    methods: [],
  },
  {
    appLabel: 'network',
    appVerboseName: 'Network',
    modelName: 'Interface',
    verboseName: 'Interface',
    verboseNamePlural: 'Interfaces',
    abstract: false,
    dbTable: 'network_interface',
    managed: true,
    fields: [{ name: 'mac_address', type: 'CharField', verboseName: null }],
    relations: [],
    methods: [],
  },
]

describe('schema discovery model helpers', () => {
  it('uses Django app and model names as stable ids', () => {
    expect(getSchemaModelId(models[0])).toBe('inventory.Device')
    expect(findSchemaModel(models, 'network.Interface')).toBe(models[1])
    expect(findSchemaModel(models, 'missing.Model')).toBeNull()
  })

  it('filters models by model, field, relation, and table text', () => {
    expect(filterSchemaModels(models, 'device')).toHaveLength(1)
    expect(filterSchemaModels(models, 'mac_address')).toEqual([models[1]])
    expect(filterSchemaModels(models, 'uplinks')).toEqual([models[0]])
    expect(filterSchemaModels(models, 'network_interface')).toEqual([models[1]])
  })

  it('groups models by app and summarizes the corpus', () => {
    expect(groupSchemaModelsByApp(models)).toEqual([
      { appName: 'Inventory', models: [models[0]] },
      { appName: 'Network', models: [models[1]] },
    ])
    expect(getSchemaDiscoveryStats(models)).toEqual({
      appCount: 2,
      modelCount: 2,
      relationCount: 1,
    })
  })
})
