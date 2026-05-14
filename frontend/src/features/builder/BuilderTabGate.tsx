import { useEffect, useState, type ReactNode } from 'react'

import type { WorkbenchTabId } from '@/store/workbenchStore'
import {
  getBuilderOpenIntentKey,
  openBuilderTabFromIntent,
  type BuilderOpenIntent,
} from './builderWorkbench'

type ResolvedBuilderTab = {
  intentKey: string
  tabId: WorkbenchTabId
}

export function BuilderTabGate({
  children,
  intent,
}: {
  children: (tabId: WorkbenchTabId) => ReactNode
  intent: BuilderOpenIntent
}) {
  const intentKey = getBuilderOpenIntentKey(intent)
  const [resolvedTab, setResolvedTab] = useState<ResolvedBuilderTab | null>(
    null,
  )

  useEffect(() => {
    const tabId = openBuilderTabFromIntent(intent)
    setResolvedTab({ intentKey, tabId })
  }, [intent, intentKey])

  if (resolvedTab?.intentKey !== intentKey) {
    return null
  }

  return children(resolvedTab.tabId)
}
