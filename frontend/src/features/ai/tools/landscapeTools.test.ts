import { beforeEach, describe, expect, it, vi } from 'vitest'

import { schemaVizGraphRetrieve } from '@/api/generated/schema-viz'

import type { AiToolContext } from './context'
import { buildLandscapeSpec, suggestDiagram } from './landscapeTools'

vi.mock('@/api/generated/schema-viz', () => ({
  schemaVizGraphRetrieve: vi.fn(),
}))

vi.mock('@/features/canvas/layout.server', () => ({
  getForwardedBackendHeaders: () => ({ authorization: 'Bearer test-token' }),
}))

const graphMock = vi.mocked(schemaVizGraphRetrieve)

const node = (id: string) => ({ id, name: id.split('.')[1]! })

// BusinessGroup <-applications- Application -servers-> Server -datacenter-> Datacenter
// Application -owner-> Person, Server -admin-> Person, Server -> AuditLog (related_name='+')
const graph = {
  nodes: [
    'infrastructure.BusinessGroup',
    'infrastructure.Application',
    'infrastructure.Server',
    'infrastructure.Datacenter',
    'infrastructure.Person',
    'audit.AuditLog',
    'infrastructure.LegacyServer',
  ].map(node),
  edges: [
    {
      source: 'infrastructure.Application',
      target: 'infrastructure.BusinessGroup',
      sourceField: 'business_group',
      reverseName: 'applications',
      isForeignKey: true,
    },
    {
      source: 'infrastructure.Application',
      target: 'infrastructure.Server',
      sourceField: 'servers',
      reverseName: 'applications',
      isManyToMany: true,
    },
    {
      source: 'infrastructure.Server',
      target: 'infrastructure.Datacenter',
      sourceField: 'datacenter',
      reverseName: 'servers',
      isForeignKey: true,
    },
    {
      source: 'infrastructure.Application',
      target: 'infrastructure.Person',
      sourceField: 'owner',
      reverseName: 'owned_applications',
      isForeignKey: true,
    },
    {
      source: 'infrastructure.Server',
      target: 'infrastructure.Person',
      sourceField: 'admin',
      reverseName: 'administered_servers',
      isForeignKey: true,
    },
    {
      source: 'audit.AuditLog',
      target: 'infrastructure.Server',
      sourceField: 'server',
      reverseName: '+',
      isForeignKey: true,
    },
    {
      source: 'infrastructure.LegacyServer',
      target: 'infrastructure.Server',
      sourceField: 'server_ptr',
      reverseName: 'legacyserver',
      isSubclass: true,
      isOneToOne: true,
    },
  ],
}

describe('buildLandscapeSpec', () => {
  it('walks forward fields and reverse accessors breadth-first', () => {
    const { spec, skipped } = buildLandscapeSpec(graph, {
      rootModel: 'infrastructure.BusinessGroup',
      maxDepth: 3,
    })

    expect(spec.title).toBe('BusinessGroup landscape')
    expect(spec.rootModel).toBe('infrastructure.BusinessGroup')
    expect(spec.steps).toEqual([
      {
        fromModel: 'infrastructure.BusinessGroup',
        toModel: 'infrastructure.Application',
        relationship: 'applications',
        groupMode: 'group',
      },
      // Forward keys leaving a box are shared lookups drawn once outside.
      {
        fromModel: 'infrastructure.Application',
        toModel: 'infrastructure.Person',
        relationship: 'owner',
        groupMode: 'breakout',
      },
      {
        fromModel: 'infrastructure.Application',
        toModel: 'infrastructure.Server',
        relationship: 'servers',
        groupMode: 'breakout',
      },
      {
        fromModel: 'infrastructure.Server',
        toModel: 'infrastructure.Datacenter',
        relationship: 'datacenter',
        groupMode: 'edge',
      },
      // Second forward path to Person becomes a line to the existing node.
      {
        fromModel: 'infrastructure.Server',
        toModel: 'infrastructure.Person',
        relationship: 'admin',
        groupMode: 'reference',
      },
    ])

    // The reverse side of that second path is only reported, the way back to
    // the parent is not, and '+'/subclass edges never show up at all.
    expect(skipped).toEqual([
      {
        fromModel: 'infrastructure.Person',
        toModel: 'infrastructure.Server',
        relationship: 'administered_servers',
        reason: 'already_reached',
      },
    ])
  })

  it('stops at maxDepth', () => {
    const { spec } = buildLandscapeSpec(graph, {
      rootModel: 'infrastructure.BusinessGroup',
      maxDepth: 1,
    })

    expect(spec.steps.map((step) => step.toModel)).toEqual([
      'infrastructure.Application',
    ])
  })

  it('honours excludeModels and apps filters and reports the cut', () => {
    const { spec, skipped } = buildLandscapeSpec(graph, {
      rootModel: 'infrastructure.Server',
      maxDepth: 2,
      excludeModels: ['infrastructure.Person'],
      apps: ['infrastructure'],
    })

    expect(spec.steps.map((step) => step.toModel)).toEqual([
      'infrastructure.Application',
      'infrastructure.Datacenter',
      'infrastructure.BusinessGroup',
    ])
    expect(skipped).toContainEqual({
      fromModel: 'infrastructure.Server',
      toModel: 'infrastructure.Person',
      relationship: 'admin',
      reason: 'excluded',
    })
  })

  it('caps the model count and reports what did not fit', () => {
    const { spec, skipped } = buildLandscapeSpec(graph, {
      rootModel: 'infrastructure.Application',
      maxDepth: 2,
      maxModels: 3,
    })

    expect(spec.steps).toHaveLength(2)
    expect(skipped.filter((hop) => hop.reason === 'limit')).not.toHaveLength(0)
  })

  it('rejects an unknown root model with a hint', () => {
    expect(() =>
      buildLandscapeSpec(graph, { rootModel: 'nope.Missing' }),
    ).toThrow(/listModels/)
  })

  it('moves a record owned by two parents into the more specific box', () => {
    // BusinessGroup -environments-> Environment -servers-> Server, but Server
    // also hangs directly off BusinessGroup and points at its Subnet.
    const infra = {
      nodes: [
        'infra.BusinessGroup',
        'infra.Environment',
        'infra.Server',
        'infra.Subnet',
      ].map(node),
      edges: [
        {
          source: 'infra.Environment',
          target: 'infra.BusinessGroup',
          sourceField: 'business_group',
          reverseName: 'environments',
          isForeignKey: true,
        },
        {
          source: 'infra.Server',
          target: 'infra.BusinessGroup',
          sourceField: 'business_group',
          reverseName: 'servers',
          isForeignKey: true,
        },
        {
          source: 'infra.Server',
          target: 'infra.Environment',
          sourceField: 'environment',
          reverseName: 'servers',
          isForeignKey: true,
        },
        {
          source: 'infra.Subnet',
          target: 'infra.BusinessGroup',
          sourceField: 'business_group',
          reverseName: 'subnets',
          isForeignKey: true,
        },
        {
          source: 'infra.Server',
          target: 'infra.Subnet',
          sourceField: 'subnet',
          reverseName: 'servers',
          isForeignKey: true,
        },
      ],
    }

    const { spec, skipped } = buildLandscapeSpec(infra, {
      rootModel: 'infra.BusinessGroup',
      maxDepth: 3,
    })

    const serverStep = spec.steps.find(
      (step) => step.toModel === 'infra.Server' && step.groupMode === 'group',
    )
    expect(serverStep).toMatchObject({
      fromModel: 'infra.Environment',
      relationship: 'servers',
    })
    // The link to the box it now sits in is implied, the subnet link stays.
    expect(spec.steps.filter((step) => step.groupMode === 'reference')).toEqual(
      [
        {
          fromModel: 'infra.Server',
          toModel: 'infra.Subnet',
          relationship: 'subnet',
          groupMode: 'reference',
        },
      ],
    )
    expect(skipped).toContainEqual({
      fromModel: 'infra.BusinessGroup',
      toModel: 'infra.Server',
      relationship: 'servers',
      reason: 'already_reached',
    })
  })

  it('nests 1:n children as containers and styles every model', () => {
    const fieldsGraph = {
      ...graph,
      nodes: graph.nodes.map((entry) =>
        entry.id === 'infrastructure.Server'
          ? {
              ...entry,
              fields: [
                ['id', 'AutoField'],
                ['hostname', 'CharField'],
                ['ip_address', 'GenericIPAddressField'],
                ['datacenter', 'ForeignKey'],
              ],
            }
          : entry,
      ),
    }

    const { spec } = buildLandscapeSpec(fieldsGraph, {
      rootModel: 'infrastructure.BusinessGroup',
      maxDepth: 3,
    })

    const modeByTarget = new Map(
      spec.steps
        .filter((step) => step.groupMode !== 'reference')
        .map((step) => [step.toModel, step.groupMode]),
    )
    // Reverse FK hops contain; forward keys out of a box break out of it and
    // links from broken-out records stay plain edges.
    expect(modeByTarget.get('infrastructure.Application')).toBe('group')
    expect(modeByTarget.get('infrastructure.Person')).toBe('breakout')
    expect(modeByTarget.get('infrastructure.Server')).toBe('breakout')
    expect(modeByTarget.get('infrastructure.Datacenter')).toBe('edge')

    expect(spec.edgeLabels).toBe('auto')
    expect(spec.styles!['infrastructure.Server']).toEqual({
      shape: 'server',
      color: expect.stringMatching(/^#[0-9A-F]{6}$/i),
      fields: ['hostname', 'ip_address'],
    })
    expect(spec.styles!['infrastructure.Person']).toMatchObject({
      shape: 'person',
    })
    expect(spec.styles!['infrastructure.Datacenter']).toMatchObject({
      shape: 'cloud',
    })

    const plain = buildLandscapeSpec(fieldsGraph, {
      rootModel: 'infrastructure.BusinessGroup',
      grouping: 'none',
    })
    expect(plain.spec.steps.every((step) => step.groupMode === 'edge')).toBe(
      true,
    )
  })
})

describe('suggestDiagram', () => {
  const context: AiToolContext = {
    auth: {
      kind: 'dev',
      user: { sub: 'tester', name: 'Tester' },
      accessToken: 'test-token',
    },
  }
  const toolContext = { context, emitCustomEvent: () => {} }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads the compact graph with the caller’s credentials', async () => {
    graphMock.mockResolvedValue({
      data: { schemaHash: 'x', groups: [], ...graph },
      headers: new Headers(),
      status: 200,
    } as unknown as Awaited<ReturnType<typeof schemaVizGraphRetrieve>>)

    const result = await suggestDiagram.execute!(
      { rootModel: 'infrastructure.BusinessGroup', title: 'Retail landscape' },
      toolContext,
    )

    expect(graphMock).toHaveBeenCalledWith(
      { includeFields: true },
      expect.objectContaining({
        headers: { authorization: 'Bearer test-token' },
        baseUrl: expect.stringMatching(/^http:\/\/.+\/schema-viz$/),
      }),
    )
    expect(result.spec.title).toBe('Retail landscape')
    expect(result.modelCount).toBe(result.spec.steps.length + 1)
    expect(result.skippedTotal).toBe(result.skipped.length)
  })
})
