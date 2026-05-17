import { createStorage, type Storage } from 'unstorage'
import fsLiteDriver from 'unstorage/drivers/fs-lite'

import type { StartAuthUser } from './startAuth'

export type StartAuthTokenRecord = {
  sessionId: string
  user: StartAuthUser
  refreshToken: string
  idToken?: string
  accessToken?: string
  accessTokenExpiresAt?: number
  version: number
  createdAt: number
  updatedAt: number
}

export type StartAuthTokenStore = {
  read(sessionId: string): Promise<StartAuthTokenRecord | null>
  write(record: StartAuthTokenRecord): Promise<void>
  delete(sessionId: string): Promise<void>
}

type StoredTokenRecord = StartAuthTokenRecord

function sessionKey(sessionId: string): string {
  return `session:${sessionId}`
}

export class UnstorageStartAuthTokenStore implements StartAuthTokenStore {
  private readonly storage: Storage<StoredTokenRecord>

  constructor(storage: Storage<StoredTokenRecord>) {
    this.storage = storage
  }

  async read(sessionId: string): Promise<StartAuthTokenRecord | null> {
    return (await this.storage.getItem(sessionKey(sessionId))) ?? null
  }

  async write(record: StartAuthTokenRecord): Promise<void> {
    await this.storage.setItem(sessionKey(record.sessionId), record)
  }

  async delete(sessionId: string): Promise<void> {
    await this.storage.removeItem(sessionKey(sessionId))
  }
}

export class MemoryStartAuthTokenStore implements StartAuthTokenStore {
  private readonly records = new Map<string, StartAuthTokenRecord>()

  async read(sessionId: string): Promise<StartAuthTokenRecord | null> {
    const record = this.records.get(sessionId)
    return record ? structuredClone(record) : null
  }

  async write(record: StartAuthTokenRecord): Promise<void> {
    this.records.set(record.sessionId, structuredClone(record))
  }

  async delete(sessionId: string): Promise<void> {
    this.records.delete(sessionId)
  }

  clear(): void {
    this.records.clear()
  }
}

let defaultTokenStore: StartAuthTokenStore | null = null

function getDefaultTokenStoreDir(): string {
  return process.env.SCHEMA_VIZ_AUTH_STORE_DIR?.trim() || '/tmp/schema-viz-auth'
}

export function getDefaultStartAuthTokenStore(): StartAuthTokenStore {
  if (defaultTokenStore) {
    return defaultTokenStore
  }

  const storage = createStorage<StoredTokenRecord>({
    driver: fsLiteDriver({
      base: getDefaultTokenStoreDir(),
    }),
  })
  defaultTokenStore = new UnstorageStartAuthTokenStore(storage)
  return defaultTokenStore
}

export function resetDefaultStartAuthTokenStoreForTests(): void {
  defaultTokenStore = null
}
