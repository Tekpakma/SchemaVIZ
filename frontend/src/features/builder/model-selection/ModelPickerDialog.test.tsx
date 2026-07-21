/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ModelInfoShort } from '@/api/contracts'
import { ModelExplorerDialog } from './ModelPickerDialog'

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal()),
  useQuery: (options: { queryKey: string[] }) => {
    const modelName = options.queryKey.at(-1)
    return {
      data: {
        relations:
          modelName === 'server'
            ? [
                {
                  name: 'environment',
                  relatedModel: 'infra.environment',
                  relatedName: 'servers',
                  reverse: false,
                  type: 'ForeignKey',
                },
              ]
            : [],
      },
      isError: false,
      isFetching: false,
    }
  },
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) => {
      const labels: Record<string, string> = {
        'builder.modelExplorer.addToLayer': `Add to ${values?.layer}`,
        'builder.modelExplorer.alreadyAdded': 'Added',
        'builder.modelExplorer.back': 'Back',
        'builder.modelExplorer.description': 'Explore relations first.',
        'builder.modelExplorer.directRelations': 'Direct relations',
        'builder.modelExplorer.exploreFrom': 'Explore from',
        'builder.modelExplorer.forward': 'outgoing',
        'builder.modelExplorer.loadingRelations': 'Loading relations',
        'builder.modelExplorer.noRelations': 'No relations',
        'builder.modelExplorer.noSearchResults': 'No results',
        'builder.modelExplorer.noSelection': 'Select a model',
        'builder.modelExplorer.relationsError': 'Relation error',
        'builder.modelExplorer.reverse': 'incoming',
        'builder.modelExplorer.search': 'Search models',
        'builder.modelExplorer.selectHint': 'Select a model to explore.',
        'builder.modelExplorer.targetLayer': `Target: ${values?.layer}`,
        'builder.modelExplorer.title': 'Model explorer',
      }
      return labels[key] ?? key
    },
  }),
}))

const models: ModelInfoShort[] = [
  {
    abstract: false,
    appLabel: 'infra',
    appVerboseName: 'Infrastructure',
    dbTable: 'infra_server',
    managed: true,
    modelName: 'server',
    verboseName: 'Server',
    verboseNamePlural: 'Servers',
  },
  {
    abstract: false,
    appLabel: 'infra',
    appVerboseName: 'Infrastructure',
    dbTable: 'infra_environment',
    managed: true,
    modelName: 'environment',
    verboseName: 'Environment',
    verboseNamePlural: 'Environments',
  },
]

describe('ModelExplorerDialog', () => {
  afterEach(() => cleanup())

  it('explores a related model before explicitly adding it', () => {
    const onPickModel = vi.fn()

    render(
      <ModelExplorerDialog
        addedModelIds={new Set(['infra.server'])}
        models={models}
        open
        sourceModelIds={['infra.server']}
        targetLayerLabel="L2"
        onOpenChange={vi.fn()}
        onPickModel={onPickModel}
      />,
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: /EnvironmentInfrastructureenvironment.*outgoing.*ForeignKey/,
      }),
    )

    expect(onPickModel).not.toHaveBeenCalled()
    expect(screen.getByText('infra.environment')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Add to L2' }))

    expect(onPickModel).toHaveBeenCalledWith(models[1])
  })
})
