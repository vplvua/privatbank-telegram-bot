import { NextResponse } from 'next/server'
import { checkServerStatus, fetchInterimTransactions, getTxnKey } from '@/lib/privatbank'
import { sendTransactionMessage, sendHeartbeat } from '@/lib/telegram'
import { getProcessedState, saveProcessedState } from '@/lib/storage'

export async function GET(request: Request) {
  // Verify cron secret (Vercel sends Authorization header for cron jobs)
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    // Step 1: Check PrivatBank server status
    const serverStatus = await checkServerStatus()
    if (!serverStatus.ok) {
      console.log(`PrivatBank server not ready: ${serverStatus.reason}`)
      return NextResponse.json({ skipped: true, reason: serverStatus.reason })
    }

    // Step 2: Fetch interim transactions
    const transactions = await fetchInterimTransactions()
    console.log(`Fetched ${transactions.length} confirmed transactions`)

    // Step 3: Load stored state
    const state = await getProcessedState()

    // Step 4: Cold start — save current keys without sending
    const now = new Date()
    if (!state) {
      console.log('Cold start: saving current transaction keys without sending')
      const entries = transactions.map((txn) => ({
        key: getTxnKey(txn),
        addedAt: now.toISOString(),
      }))
      await saveProcessedState({
        processedKeys: entries,
        checkedAt: now.toISOString(),
      })
      return NextResponse.json({ coldStart: true, savedKeys: entries.length })
    }

    // Step 5: Find new transactions (deduplicate by REF+REFN)
    // Keep keys for 48h to survive banking day transitions
    const cutoff = new Date(now.getTime() - 48 * 60 * 60 * 1000)
    const validEntries = state.processedKeys.filter(
      (entry) => new Date(entry.addedAt) > cutoff
    )
    const knownKeys = new Set(validEntries.map((entry) => entry.key))
    const newTransactions = transactions.filter(
      (txn) => !knownKeys.has(getTxnKey(txn))
    )
    console.log(`New transactions: ${newTransactions.length}, known keys: ${knownKeys.size}`)

    // Step 6: Send notifications
    let sentCount = 0
    for (const txn of newTransactions) {
      const sent = await sendTransactionMessage(txn)
      if (sent) {
        sentCount++
      } else {
        console.error(`Failed to send notification for txn ${getTxnKey(txn)}`)
      }
    }

    // Step 7: Heartbeat — send daily "bot alive" message
    let lastHeartbeatAt = state.lastHeartbeatAt
    const shouldSendHeartbeat = !lastHeartbeatAt ||
      now.getTime() - new Date(lastHeartbeatAt).getTime() >= 24 * 60 * 60 * 1000

    if (shouldSendHeartbeat) {
      const sent = await sendHeartbeat(now.toISOString(), transactions.length)
      if (sent) {
        lastHeartbeatAt = now.toISOString()
        console.log('Heartbeat sent')
      }
    }

    // Step 8: Merge new keys with existing, keep only last 48h
    const newEntries = newTransactions.map((txn) => ({
      key: getTxnKey(txn),
      addedAt: now.toISOString(),
    }))
    const mergedKeys = [...validEntries, ...newEntries]

    await saveProcessedState({
      processedKeys: mergedKeys,
      checkedAt: now.toISOString(),
      lastHeartbeatAt,
    })

    console.log(`Done: sent ${sentCount}/${newTransactions.length} notifications`)
    return NextResponse.json({
      processed: transactions.length,
      new: newTransactions.length,
      sent: sentCount,
    })
  } catch (error) {
    console.error('Cron job error:', error)
    // Return 200 to prevent Vercel from retrying
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 200 }
    )
  }
}
