import { createRequire } from 'node:module'
import ELK from 'elkjs/lib/elk-api.js'
import type { ELK as ElkInstance } from 'elkjs/lib/elk-api'

const require = createRequire(import.meta.url)

export function createServerElk(): ElkInstance {
  const workerUrl = require.resolve('elkjs/lib/elk-worker.min.js')

  return new ELK({
    workerFactory: () => new Worker(workerUrl),
  })
}

