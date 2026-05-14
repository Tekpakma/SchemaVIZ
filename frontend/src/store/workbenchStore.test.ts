import { beforeEach, describe, expect, it } from 'vitest'

import {
  getActiveWorkbenchTabIdSnapshot,
  getWorkbenchActionsSnapshot,
  getWorkbenchTabsSnapshot,
  resetWorkbenchStoreForTests,
} from './workbenchStore'

describe('workbenchStore', () => {
  beforeEach(() => {
    resetWorkbenchStoreForTests()
  })

  it('opens a draft tab and activates it', () => {
    const tabId = getWorkbenchActionsSnapshot().openTab({
      kind: 'generation-builder',
      title: 'Draft template',
      resource: {
        type: 'draft',
        localId: 'draft-1',
      },
    })

    expect(getActiveWorkbenchTabIdSnapshot()).toBe(tabId)
    expect(getWorkbenchTabsSnapshot()).toMatchObject([
      {
        id: tabId,
        kind: 'generation-builder',
        title: 'Draft template',
        dedupeKey: 'generation-builder:draft:draft-1',
        closable: true,
        dirty: false,
      },
    ])
  })

  it('deduplicates by hybrid dedupe key and activates the existing tab', () => {
    const actions = getWorkbenchActionsSnapshot()
    const firstTabId = actions.openTab({
      kind: 'generation-builder',
      title: 'Original',
      resource: {
        type: 'template',
        id: 'tpl-1',
      },
    })

    const secondTabId = actions.openTab({
      kind: 'generation-builder',
      title: 'Duplicate',
      resource: {
        type: 'template',
        id: 'tpl-1',
      },
    })

    expect(secondTabId).toBe(firstTabId)
    expect(getActiveWorkbenchTabIdSnapshot()).toBe(firstTabId)
    expect(getWorkbenchTabsSnapshot()).toHaveLength(1)
    expect(getWorkbenchTabsSnapshot()[0]?.title).toBe('Original')
  })

  it('deduplicates singleton tools by kind', () => {
    const actions = getWorkbenchActionsSnapshot()
    const firstTabId = actions.openTab({
      kind: 'schema-browser',
      title: 'Schema',
      resource: {
        type: 'schema-browser',
      },
    })
    const secondTabId = actions.openTab({
      kind: 'schema-browser',
      title: 'Schema again',
      resource: {
        type: 'schema-browser',
      },
    })

    expect(secondTabId).toBe(firstTabId)
    expect(getWorkbenchTabsSnapshot()).toHaveLength(1)
  })

  it('renames and marks dirty state per tab', () => {
    const actions = getWorkbenchActionsSnapshot()
    const firstTabId = actions.openTab({
      kind: 'generation-builder',
      title: 'First',
      resource: {
        type: 'draft',
        localId: 'first',
      },
    })
    const secondTabId = actions.openTab({
      kind: 'node-template-designer',
      title: 'Second',
      resource: {
        type: 'draft',
        localId: 'second',
      },
    })

    actions.renameTab(firstTabId, 'First renamed')
    actions.markDirty(firstTabId)

    expect(getWorkbenchTabsSnapshot()).toMatchObject([
      {
        id: firstTabId,
        title: 'First renamed',
        dirty: true,
      },
      {
        id: secondTabId,
        title: 'Second',
        dirty: false,
      },
    ])
  })

  it('closes the active tab and activates the nearest previous tab', () => {
    const actions = getWorkbenchActionsSnapshot()
    const firstTabId = actions.openTab({
      kind: 'generation-builder',
      title: 'First',
      resource: {
        type: 'draft',
        localId: 'first',
      },
    })
    const secondTabId = actions.openTab({
      kind: 'generation-builder',
      title: 'Second',
      resource: {
        type: 'draft',
        localId: 'second',
      },
    })
    const thirdTabId = actions.openTab({
      kind: 'generation-builder',
      title: 'Third',
      resource: {
        type: 'draft',
        localId: 'third',
      },
    })

    actions.closeTab(thirdTabId)
    expect(getActiveWorkbenchTabIdSnapshot()).toBe(secondTabId)

    actions.closeTab(secondTabId)
    expect(getActiveWorkbenchTabIdSnapshot()).toBe(firstTabId)
  })

  it('keeps non-closable tabs and falls back to them when closing active tabs', () => {
    const actions = getWorkbenchActionsSnapshot()
    const pinnedTabId = actions.openTab({
      kind: 'schema-browser',
      title: 'Schema',
      resource: {
        type: 'schema-browser',
      },
      closable: false,
    })

    actions.closeTab(pinnedTabId)
    expect(getActiveWorkbenchTabIdSnapshot()).toBe(pinnedTabId)
    expect(getWorkbenchTabsSnapshot()).toHaveLength(1)

    const draftTabId = actions.openTab({
      kind: 'generation-builder',
      title: 'Draft',
      resource: {
        type: 'draft',
        localId: 'draft',
      },
    })

    actions.closeTab(draftTabId)
    expect(getActiveWorkbenchTabIdSnapshot()).toBe(pinnedTabId)

    actions.closeTab(pinnedTabId)
    expect(getActiveWorkbenchTabIdSnapshot()).toBe(pinnedTabId)
  })

  it('clears active id when the final closable tab closes', () => {
    const actions = getWorkbenchActionsSnapshot()
    const tabId = actions.openTab({
      kind: 'generation-builder',
      title: 'Only tab',
      resource: {
        type: 'draft',
        localId: 'only',
      },
    })

    actions.closeTab(tabId)

    expect(getActiveWorkbenchTabIdSnapshot()).toBeNull()
    expect(getWorkbenchTabsSnapshot()).toEqual([])
  })
})
