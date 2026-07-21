/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { LexicalOverlayRuntimeProvider } from '../LexicalOverlayRuntimeContext'
import type { LexicalOverlayRuntime } from '../LexicalOverlayRuntimeContext'
import { DataReferenceNode } from './DataReferenceNode'
import { DataReferenceBrowser } from './DataReferenceBrowser'

vi.mock('./useDataReferenceSuggestions', () => ({
  useDataReferenceSuggestions: (
    _dataScope: unknown,
    path: string,
  ) =>
    path === 'owner.'
      ? [
          {
            fieldName: 'owner.email',
            label: 'owner.email',
            description: 'Email address',
            type: 'EmailField',
            source: 'relation',
          },
        ]
      : [
          {
            fieldName: 'name',
            label: 'name',
            description: 'Display name',
            type: 'CharField',
            source: 'field',
          },
          {
            fieldName: 'owner.',
            label: 'owner',
            description: 'Relation',
            type: 'relation',
            source: 'relation-root',
          },
        ],
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const labels: Record<string, string> = {
        'builder.dataReferenceBrowser.back': 'Back',
        'builder.dataReferenceBrowser.description': 'Choose a field.',
        'builder.dataReferenceBrowser.empty': 'No fields',
        'builder.dataReferenceBrowser.fields': 'Fields',
        'builder.dataReferenceBrowser.loading': 'Loading',
        'builder.dataReferenceBrowser.openRelation': 'Open relation',
        'builder.dataReferenceBrowser.relations': 'Relations',
        'builder.dataReferenceBrowser.title': 'Insert data',
        'builder.inlineToolbar.insertData': 'Insert data',
        'builder.inlineToolbar.insertDataUnavailable': 'Unavailable',
      }
      return labels[key] ?? key
    },
  }),
}))

const runtime = {
  dataScope: {
    appLabel: 'infra',
    modelName: 'server',
  },
  node: {},
  nodeId: 'server',
  shapeDefinition: {},
} as LexicalOverlayRuntime

const initialConfig = {
  editable: true,
  namespace: 'data-reference-browser-test',
  nodes: [DataReferenceNode],
  onError: (error: Error) => {
    throw error
  },
}

describe('DataReferenceBrowser', () => {
  afterEach(() => cleanup())

  it('lets users discover fields and drill into relations without typing template syntax', () => {
    render(
      <LexicalOverlayRuntimeProvider value={runtime}>
        <LexicalComposer initialConfig={initialConfig}>
          <DataReferenceBrowser controlClass="" onInteract={vi.fn()} />
        </LexicalComposer>
      </LexicalOverlayRuntimeProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Insert data' }))

    expect(screen.getByRole('button', { name: /name.*Display name/ })).toBeTruthy()
    fireEvent.click(
      screen.getByRole('button', { name: /owner.*Open relation/ }),
    )

    expect(screen.getByText('owner')).toBeTruthy()
    expect(
      screen.getByRole('button', { name: /email.*Email address/ }),
    ).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByRole('button', { name: /name.*Display name/ })).toBeTruthy()
  })
})
