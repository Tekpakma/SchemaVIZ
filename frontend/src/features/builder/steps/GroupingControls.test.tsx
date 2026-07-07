/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { RecipeModel, TraversalEdge } from '../types'
import { DEFAULT_RECIPE_GROUP_LAYOUT } from '../types'
import { GroupingControls } from './GroupingControls'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const labels: Record<string, string> = {
        'builder.grouping.mode_breakout': 'Breakout',
        'builder.grouping.mode_group': 'Group',
        'builder.grouping.mode_none': 'None',
        'builder.layout.grouping': 'Grouping',
      }
      return labels[key] ?? key
    },
  }),
}))

const models: RecipeModel[] = [
  {
    id: 'business',
    appLabel: 'infra',
    appVerboseName: 'Infrastructure',
    displayName: 'Business',
    layerId: 'layer-business',
    modelId: 'infra.Business',
    modelName: 'Business',
  },
  {
    id: 'network',
    appLabel: 'infra',
    appVerboseName: 'Infrastructure',
    displayName: 'Network',
    layerId: 'layer-network',
    modelId: 'infra.Network',
    modelName: 'Network',
  },
  {
    id: 'provider',
    appLabel: 'infra',
    appVerboseName: 'Infrastructure',
    displayName: 'Provider',
    layerId: 'layer-provider',
    modelId: 'infra.Provider',
    modelName: 'Provider',
  },
]

const edges: TraversalEdge[] = [
  {
    id: 'edge-business-network',
    from: 'Business',
    to: 'Network',
    fromModelId: 'business',
    toModelId: 'network',
    via: 'networks',
    auto: true,
    cost: 1,
  },
  {
    id: 'edge-network-provider',
    from: 'Network',
    to: 'Provider',
    fromModelId: 'network',
    toModelId: 'provider',
    via: 'provider',
    auto: true,
    cost: 1,
  },
]

describe('GroupingControls interactions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('lets users group at one point in a line and break out downstream', () => {
    const actions = {
      addGroupRule: vi.fn(),
      removeGroupRule: vi.fn(),
    }
    const { rerender } = render(
      <GroupingControls
        actions={actions}
        edges={edges}
        groupRules={[]}
        models={models}
      />,
    )

    fireEvent.click(screen.getAllByRole('button', { name: 'Group' })[0]!)

    expect(actions.addGroupRule).toHaveBeenCalledWith({
      id: 'grp-edge-business-network',
      parentModelId: 'business',
      childModelId: 'network',
      via: 'networks',
      mode: 'group',
      layout: DEFAULT_RECIPE_GROUP_LAYOUT,
    })

    rerender(
      <GroupingControls
        actions={actions}
        edges={edges}
        groupRules={[
          {
            id: 'grp-edge-business-network',
            parentModelId: 'business',
            childModelId: 'network',
            via: 'networks',
            mode: 'group',
            layout: DEFAULT_RECIPE_GROUP_LAYOUT,
          },
        ]}
        models={models}
      />,
    )

    expect(
      screen
        .getAllByRole('button', { name: 'Group' })[0]
        ?.getAttribute('aria-pressed'),
    ).toBe('true')

    fireEvent.click(screen.getAllByRole('button', { name: 'Breakout' })[1]!)

    expect(actions.removeGroupRule).not.toHaveBeenCalled()
    expect(actions.addGroupRule).toHaveBeenLastCalledWith({
      id: 'grp-edge-network-provider',
      parentModelId: 'network',
      childModelId: 'provider',
      via: 'provider',
      mode: 'breakout',
    })
  })

  it('replaces an active group relation when the same edge is switched to breakout', () => {
    const actions = {
      addGroupRule: vi.fn(),
      removeGroupRule: vi.fn(),
    }

    render(
      <GroupingControls
        actions={actions}
        edges={[edges[1]!]}
        groupRules={[
          {
            id: 'grp-edge-network-provider',
            parentModelId: 'network',
            childModelId: 'provider',
            via: 'provider',
            mode: 'group',
            layout: DEFAULT_RECIPE_GROUP_LAYOUT,
          },
        ]}
        models={models}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Breakout' }))

    expect(actions.removeGroupRule).toHaveBeenCalledWith(
      'grp-edge-network-provider',
    )
    expect(actions.addGroupRule).toHaveBeenCalledWith({
      id: 'grp-edge-network-provider',
      parentModelId: 'network',
      childModelId: 'provider',
      via: 'provider',
      mode: 'breakout',
    })
  })
})
