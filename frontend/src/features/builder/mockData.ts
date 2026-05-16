import type {
  ExampleRecord,
  RecipeData,
  RecipeFilter,
  RecipeLayer,
  RecipeModel,
  TraversalEdge,
} from './types'

export const MOCK_LAYERS: RecipeLayer[] = [
  { id: 'l1', label: 'Business groups' },
  { id: 'l2', label: 'Services' },
  { id: 'l3', label: 'Compute' },
  { id: 'l4', label: 'Data' },
]

export const MOCK_EXAMPLES: ExampleRecord[] = [
  {
    id: 'ex-fin',
    label: 'Finance dept.',
    kind: 'Business group',
    idValue: 'org:fin-001',
    isDefault: true,
  },
  {
    id: 'ex-hr',
    label: 'HR dept.',
    kind: 'Business group',
    idValue: 'org:hr-007',
    isDefault: false,
  },
  {
    id: 'ex-s4',
    label: 'SAP S/4HANA',
    kind: 'Service',
    idValue: 'svc:s4-prod',
    isDefault: false,
  },
  {
    id: 'ex-eu',
    label: 'EU region',
    kind: 'Region',
    idValue: 'region:eu-1',
    isDefault: false,
  },
]

export const MOCK_MODELS: RecipeModel[] = [
  {
    id: 'm1',
    appLabel: 'org',
    appVerboseName: 'Organization',
    modelName: 'businessgroup',
    modelId: 'org.businessgroup',
    displayName: 'Business group',
    layerId: 'l1',
  },
  {
    id: 'm2',
    appLabel: 'service',
    appVerboseName: 'Services',
    modelName: 'service',
    modelId: 'service.service',
    displayName: 'Service',
    layerId: 'l2',
  },
  {
    id: 'm3',
    appLabel: 'compute',
    appVerboseName: 'Compute',
    modelName: 'server',
    modelId: 'compute.server',
    displayName: 'Server',
    layerId: 'l3',
  },
  {
    id: 'm4',
    appLabel: 'data',
    appVerboseName: 'Data',
    modelName: 'database',
    modelId: 'data.database',
    displayName: 'Database',
    layerId: 'l4',
  },
]

export const MOCK_EDGES: TraversalEdge[] = [
  {
    id: 'e1',
    from: 'Business group',
    to: 'Service',
    fromModelId: 'm1',
    toModelId: 'm2',
    via: 'uses',
    auto: true,
    cost: 1,
  },
  {
    id: 'e2',
    from: 'Service',
    to: 'Server',
    fromModelId: 'm2',
    toModelId: 'm3',
    via: 'runs-on',
    auto: true,
    cost: 1,
  },
  {
    id: 'e3',
    from: 'Service',
    to: 'Server',
    fromModelId: 'm2',
    toModelId: 'm3',
    via: 'fallback-on',
    auto: false,
    cost: 2,
    alt: true,
  },
  {
    id: 'e4',
    from: 'Server',
    to: 'Database',
    fromModelId: 'm3',
    toModelId: 'm4',
    via: 'persists',
    auto: true,
    cost: 1,
  },
]

export const MOCK_FILTERS: RecipeFilter[] = [
  {
    id: 'f1',
    layer: 'Services',
    expr: 'owner__team__org = start.org',
    suggested: false,
  },
  {
    id: 'f2',
    layer: 'Compute',
    expr: 'region = start.region',
    suggested: false,
  },
  {
    id: 'f3',
    layer: 'Compute',
    expr: "status != 'decommissioned'",
    suggested: true,
  },
  {
    id: 'f4',
    layer: 'Data',
    expr: "classification__in = ['internal','public']",
    suggested: false,
  },
]

export const MOCK_RECIPE: RecipeData = {
  title: 'SAP Cloud Landscape',
  layers: MOCK_LAYERS,
  models: MOCK_MODELS,
  examples: MOCK_EXAMPLES,
  edges: MOCK_EDGES,
  filters: MOCK_FILTERS,
  swatches: ['#C4006A', '#1D8B68', '#6A2B4D', '#18181B'],
  layoutAlgorithm: 'Layered',
  promoteOrg: 'kaisommer',
  promoteVisibility: 'org-wide',
  promoteAudience: '12 teams',
}
