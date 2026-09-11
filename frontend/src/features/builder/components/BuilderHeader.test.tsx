/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { BuilderHeader } from './BuilderHeader'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/components/router/RouterLink', () => ({
  HomeLink: ({ children, ...props }: React.ComponentProps<'a'>) => (
    <a {...props}>{children}</a>
  ),
}))

afterEach(cleanup)

describe('BuilderHeader template transfer actions', () => {
  it('exports the current template and passes the selected import file', () => {
    const onExport = vi.fn()
    const onImport = vi.fn()
    const { container } = render(
      <BuilderHeader
        title="Service map"
        onExport={onExport}
        onImport={onImport}
        onPublish={vi.fn()}
        onSave={vi.fn()}
        onTitleChange={vi.fn()}
      />,
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'builder.header.exportTemplate' }),
    )
    expect(onExport).toHaveBeenCalledOnce()

    const file = new File(['{}'], 'template.json', {
      type: 'application/json',
    })
    const input = container.querySelector('input[type="file"]')
    expect(input).not.toBeNull()
    fireEvent.change(input!, { target: { files: [file] } })

    expect(onImport).toHaveBeenCalledWith(file)
  })
})
