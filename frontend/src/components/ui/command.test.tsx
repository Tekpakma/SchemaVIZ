/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CommandLoadMore } from './command'

afterEach(cleanup)

describe('CommandLoadMore', () => {
  it('renders pagination as a visible button outside the scrollable list', () => {
    const onClick = vi.fn()

    render(<CommandLoadMore onClick={onClick}>Load more</CommandLoadMore>)

    const button = screen.getByRole('button', { name: 'Load more' })
    expect(button.closest('[data-slot="command-pagination"]')).not.toBeNull()

    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('prevents another page request while loading', () => {
    const onClick = vi.fn()

    render(
      <CommandLoadMore disabled aria-busy="true" onClick={onClick}>
        Loading
      </CommandLoadMore>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Loading' }))
    expect(onClick).not.toHaveBeenCalled()
  })
})
