import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { useShallow } from 'zustand/react/shallow'

export type WorkbenchTabId = string

export type WorkbenchTabKind =
  | 'generation-builder'
  | 'node-template-designer'
  | 'schema-browser'
  | 'canvas-document'

export type WorkbenchTabResource =
  | {
      type: 'draft'
      localId: string
    }
  | {
      type: 'template'
      id: string
    }
  | {
      type: 'schema-browser'
    }
  | {
      type: 'canvas-document'
      id: string
    }

export type WorkbenchTab = {
  id: WorkbenchTabId
  kind: WorkbenchTabKind
  title: string
  dedupeKey: string
  closable: boolean
  dirty: boolean
  resource: WorkbenchTabResource
  createdAt: number
  lastActiveAt: number
}

export type OpenWorkbenchTabPayload = {
  kind: WorkbenchTabKind
  title: string
  resource: WorkbenchTabResource
  dedupeKey?: string
  closable?: boolean
}

type WorkbenchState = {
  tabsById: Record<WorkbenchTabId, WorkbenchTab>
  tabOrder: Array<WorkbenchTabId>
  activeTabId: WorkbenchTabId | null
  actions: WorkbenchActions
}

type WorkbenchActions = {
  openTab: (payload: OpenWorkbenchTabPayload) => WorkbenchTabId
  switchTab: (tabId: WorkbenchTabId) => void
  closeTab: (tabId: WorkbenchTabId) => void
  renameTab: (tabId: WorkbenchTabId, title: string) => void
  markDirty: (tabId: WorkbenchTabId, dirty?: boolean) => void
}

function createWorkbenchTabId(kind: WorkbenchTabKind) {
  return `${kind}-${crypto.randomUUID().slice(0, 8)}`
}

function getWorkbenchTabDedupeKey({
  kind,
  resource,
}: {
  kind: WorkbenchTabKind
  resource: WorkbenchTabResource
}) {
  switch (resource.type) {
    case 'draft':
      return `${kind}:draft:${resource.localId}`
    case 'template':
      return `${kind}:template:${resource.id}`
    case 'schema-browser':
      return 'schema-browser'
    case 'canvas-document':
      return `${kind}:canvas:${resource.id}`
  }
}

function createInitialWorkbenchState() {
  return {
    tabsById: {},
    tabOrder: [],
    activeTabId: null,
  }
}

function getNextActiveTabId(
  tabOrder: Array<WorkbenchTabId>,
  closingIndex: number,
) {
  return tabOrder[closingIndex - 1] ?? tabOrder[closingIndex + 1] ?? null
}

const useWorkbenchStore = create<WorkbenchState>()(
  devtools(
    immer((set) => ({
      ...createInitialWorkbenchState(),
      actions: {
        openTab: (payload) => {
          const dedupeKey =
            payload.dedupeKey ?? getWorkbenchTabDedupeKey(payload)
          const now = Date.now()
          let openedTabId: WorkbenchTabId | null = null

          set(
            (state) => {
              const existingTab = Object.values(state.tabsById).find(
                (tab) => tab.dedupeKey === dedupeKey,
              )

              if (existingTab) {
                existingTab.lastActiveAt = now
                state.activeTabId = existingTab.id
                openedTabId = existingTab.id
                return
              }

              const id = createWorkbenchTabId(payload.kind)
              const tab: WorkbenchTab = {
                id,
                kind: payload.kind,
                title: payload.title,
                dedupeKey,
                closable: payload.closable ?? true,
                dirty: false,
                resource: payload.resource,
                createdAt: now,
                lastActiveAt: now,
              }

              state.tabsById[id] = tab
              state.tabOrder.push(id)
              state.activeTabId = id
              openedTabId = id
            },
            false,
            'workbench/openTab',
          )

          return openedTabId!
        },

        switchTab: (tabId) =>
          set(
            (state) => {
              const tab = state.tabsById[tabId]
              if (!tab || state.activeTabId === tabId) return

              tab.lastActiveAt = Date.now()
              state.activeTabId = tabId
            },
            false,
            'workbench/switchTab',
          ),

        closeTab: (tabId) =>
          set(
            (state) => {
              const tab = state.tabsById[tabId]
              if (!tab?.closable) return

              const closingIndex = state.tabOrder.indexOf(tabId)
              if (closingIndex === -1) return

              const nextActiveTabId = getNextActiveTabId(
                state.tabOrder,
                closingIndex,
              )

              delete state.tabsById[tabId]
              state.tabOrder = state.tabOrder.filter((id) => id !== tabId)

              if (state.activeTabId === tabId) {
                state.activeTabId = nextActiveTabId
              }
            },
            false,
            'workbench/closeTab',
          ),

        renameTab: (tabId, title) =>
          set(
            (state) => {
              const tab = state.tabsById[tabId]
              const nextTitle = title.trim()
              if (!tab || !nextTitle) return

              tab.title = nextTitle
            },
            false,
            'workbench/renameTab',
          ),

        markDirty: (tabId, dirty = true) =>
          set(
            (state) => {
              const tab = state.tabsById[tabId]
              if (!tab) return

              tab.dirty = dirty
            },
            false,
            'workbench/markDirty',
          ),
      },
    })),
    {
      name: 'WorkbenchStore',
      enabled: import.meta.env.DEV,
    },
  ),
)

export function getActiveWorkbenchTabIdSnapshot() {
  return useWorkbenchStore.getState().activeTabId
}

export function getActiveWorkbenchTabSnapshot() {
  const state = useWorkbenchStore.getState()
  return state.activeTabId ? state.tabsById[state.activeTabId]! : null
}

export function getWorkbenchTabsSnapshot() {
  const state = useWorkbenchStore.getState()
  return state.tabOrder.flatMap((id) => {
    const tab = state.tabsById[id]
    return tab ? [tab] : []
  })
}

export function getWorkbenchActionsSnapshot() {
  return useWorkbenchStore.getState().actions
}

export function resetWorkbenchStoreForTests() {
  useWorkbenchStore.setState((state) => ({
    ...state,
    ...createInitialWorkbenchState(),
  }))
}

export const useWorkbenchActions = () =>
  useWorkbenchStore((state) => state.actions)

export const useWorkbenchTabs = () =>
  useWorkbenchStore(
    useShallow((state) =>
      state.tabOrder.flatMap((id) => {
        const tab = state.tabsById[id]
        return tab ? [tab] : []
      }),
    ),
  )

export const useActiveWorkbenchTabId = () =>
  useWorkbenchStore((state) => state.activeTabId)

export const useActiveWorkbenchTab = () =>
  useWorkbenchStore((state) =>
    state.activeTabId ? state.tabsById[state.activeTabId]! : null,
  )
