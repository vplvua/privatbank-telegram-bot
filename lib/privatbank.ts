import {
  PrivatTransaction,
  PrivatTransactionsResponse,
  PrivatSettingsResponse,
} from '@/lib/types'

const BASE_URL = 'https://acp.privatbank.ua'

function getHeaders(): HeadersInit {
  return {
    'token': process.env.PRIVATBANK_TOKEN!,
    'Content-Type': 'application/json;charset=utf-8',
    'User-Agent': 'privatbank-tg-bot',
  }
}

export async function checkServerStatus(): Promise<{ ok: boolean; reason?: string }> {
  const res = await fetch(`${BASE_URL}/api/statements/settings`, {
    headers: getHeaders(),
  })

  if (!res.ok) {
    return { ok: false, reason: `HTTP ${res.status}` }
  }

  const data: PrivatSettingsResponse = await res.json()

  if (data.status !== 'SUCCESS') {
    return { ok: false, reason: `API status: ${data.status}` }
  }

  if (data.settings.phase !== 'WRK') {
    return { ok: false, reason: `Server phase: ${data.settings.phase}` }
  }

  if (data.settings.work_balance === 'Y') {
    return { ok: false, reason: 'work_balance is Y — requests not allowed' }
  }

  return { ok: true }
}

export async function fetchInterimTransactions(): Promise<PrivatTransaction[]> {
  const account = process.env.PRIVATBANK_ACCOUNT!
  const allTransactions: PrivatTransaction[] = []
  let followId: string | null = null

  do {
    const url = new URL(`${BASE_URL}/api/statements/transactions/interim`)
    url.searchParams.set('acc', account)
    url.searchParams.set('limit', '100')
    if (followId) {
      url.searchParams.set('followId', followId)
    }

    const res = await fetch(url.toString(), { headers: getHeaders() })

    if (!res.ok) {
      throw new Error(`PrivatBank API error: HTTP ${res.status}`)
    }

    const data: PrivatTransactionsResponse = await res.json()

    if (data.status !== 'SUCCESS') {
      throw new Error(`PrivatBank API error: status ${data.status}`)
    }

    const confirmed = data.transactions.filter(
      (txn) => txn.PR_PR === 'r' && txn.FL_REAL === 'r'
    )
    allTransactions.push(...confirmed)

    followId = data.exist_next_page ? data.next_page_id : null
  } while (followId)

  return allTransactions
}

export function getTxnKey(txn: PrivatTransaction): string {
  return `${txn.REF}${txn.REFN}`
}
