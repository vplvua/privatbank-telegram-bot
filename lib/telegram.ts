import { PrivatTransaction } from '@/lib/types'

const TELEGRAM_API = 'https://api.telegram.org'

async function sendMessage(text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN!
  const chatId = process.env.TELEGRAM_CHAT_ID!

  const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
    }),
  })

  if (!res.ok) {
    console.error(`Telegram API error: HTTP ${res.status}`, await res.text())
    return false
  }

  return true
}

function formatAmount(sum: string, ccy: string): string {
  const num = parseFloat(sum)
  const formatted = num.toLocaleString('uk-UA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${formatted} ${ccy}`
}

function formatDateTime(dateTime: string): string {
  // Input: "02.04.2026 14:32:00" → "02.04.2026 14:32"
  return dateTime.replace(/:00$/, '')
}

export async function sendTransactionMessage(txn: PrivatTransaction): Promise<boolean> {
  const isCredit = txn.TRANTYPE === 'C'

  const icon = isCredit ? '🟢' : '🔴'
  const type = isCredit ? 'Надходження' : 'Списання'
  const sign = isCredit ? '+' : '-'

  const lines = [
    `${icon} <b>${type}</b>`,
    `${sign}${formatAmount(txn.SUM, txn.CCY)}`,
    `${txn.AUT_CNTR_NAM}`,
    `${txn.OSND}`,
    `${formatDateTime(txn.DATE_TIME_DAT_OD_TIM_P)}`,
  ]

  return sendMessage(lines.join('\n'))
}

export async function sendHeartbeat(checkedAt: string, txnCount: number): Promise<boolean> {
  const date = new Date(checkedAt)
  const formatted = date.toLocaleString('uk-UA', {
    timeZone: 'Europe/Kyiv',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  const lines = [
    '💚 <b>Бот працює</b>',
    `Остання перевірка: ${formatted}`,
    `Транзакцій за добу: ${txnCount}`,
  ]

  return sendMessage(lines.join('\n'))
}
