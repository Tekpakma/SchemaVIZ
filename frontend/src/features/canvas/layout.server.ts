import { getRequestHeader } from '@tanstack/react-start/server'
import type { ELK } from 'elkjs/lib/elk-api'
import * as R from 'remeda'

import { createElkGraph, createGraphLayoutResult } from './layoutAdapters'
import type { CanvasLayoutInput } from './layout.schemas'

let elkPromise: Promise<ELK> | null = null

/** Lazily initializes and caches a single ELK instance (promise-memoized to avoid races). */
function getElk() {
  if (!elkPromise) {
    elkPromise = import('@/features/elk/server').then(({ createServerElk }) =>
      createServerElk(),
    )
  }
  return elkPromise
}

export async function runElkLayout(input: CanvasLayoutInput) {
  const elkInstance = await getElk()
  const graph = createElkGraph(input)
  const laidOutGraph = await elkInstance.layout(graph)

  return createGraphLayoutResult(laidOutGraph)
}

export function getForwardedBackendHeaders() {
  const headers = new Headers({ accept: 'application/json' })

  const authHeaders = {
    authorization: getRequestHeader('authorization'),
    cookie: getRequestHeader('cookie'),
  }

  R.pipe(
    authHeaders,
    R.pickBy(R.isString), // Only keep headers that exist
    R.forEachObj((value, key) => headers.set(key, value)),
  )

  return headers
}
