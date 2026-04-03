import { Redis } from '@upstash/redis'
import { StorageState } from '@/lib/types'

const STORAGE_KEY = 'last_processed_txns'

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

export async function getProcessedState(): Promise<StorageState | null> {
  const state = await redis.get<StorageState>(STORAGE_KEY)
  return state ?? null
}

export async function saveProcessedState(state: StorageState): Promise<void> {
  await redis.set(STORAGE_KEY, state)
}
