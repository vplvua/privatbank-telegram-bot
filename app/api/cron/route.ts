import { NextResponse } from 'next/server'
import { checkServerStatus, fetchInterimTransactions, getTxnKey } from '@/lib/privatbank'
import { sendTransactionMessage } from '@/lib/telegram'
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
    if (!state) {
      console.log('Cold start: saving current transaction keys without sending')
      const keys = transactions.map(getTxnKey)
      await saveProcessedState({
        processedKeys: keys,
        checkedAt: new Date().toISOString(),
      })
      return NextResponse.json({ coldStart: true, savedKeys: keys.length })
    }

    // Step 5: Find new transactions (deduplicate by REF+REFN)
    const knownKeys = new Set(state.processedKeys)
    const newTransactions = transactions.filter(
      (txn) => !knownKeys.has(getTxnKey(txn))
    )
    console.log(`New transactions: ${newTransactions.length}`)

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

    // Step 7: Update stored state with all current transaction keys
    const allKeys = transactions.map(getTxnKey)
    await saveProcessedState({
      processedKeys: allKeys,
      checkedAt: new Date().toISOString(),
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
