import { Redis } from '@upstash/redis'
import { StorageState, ProcessedKeyEntry } from '@/lib/types'

const STORAGE_KEY = 'last_processed_txns'

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

interface LegacyStorageState {
  processedKeys: string[]
  checkedAt: string
  lastHeartbeatAt?: string
}

export async function getProcessedState(): Promise<StorageState | null> {
  const raw = await redis.get<StorageState | LegacyStorageState>(STORAGE_KEY)
  if (!raw) return null

  // Migrate old format: string[] → { key, addedAt }[]
  if (raw.processedKeys.length > 0 && typeof raw.processedKeys[0] === 'string') {
    const legacy = raw as LegacyStorageState
    const migrated: StorageState = {
      ...legacy,
      processedKeys: legacy.processedKeys.map((key) => ({
        key,
        addedAt: legacy.checkedAt,
      })),
    }
    console.log(`Migrated ${migrated.processedKeys.length} keys from old format`)
    await saveProcessedState(migrated)
    return migrated
  }

  return raw as StorageState
}

export async function saveProcessedState(state: StorageState): Promise<void> {
  await redis.set(STORAGE_KEY, state)
}
