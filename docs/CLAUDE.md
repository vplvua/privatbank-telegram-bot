# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Telegram bot that polls PrivatBank API for FOP (sole proprietor) account transactions and sends notifications. Single-user (Vasyl), no interactive commands — purely a scheduled polling service.

**Language:** TypeScript, Node.js 20
**Platform:** Vercel Serverless Functions + Vercel Cron Jobs (Pro plan)
**Storage:** Vercel KV (Redis) for persistent state between cron invocations

## Commands

```bash
npm install          # install dependencies
npm run dev          # local dev server (Vercel CLI)
npx vercel dev       # alternative: run Vercel dev environment locally
```

## Architecture

The cron function (`api/cron/check-transactions.ts`) runs every 5 minutes:

1. Check server health: `GET /api/statements/settings` — proceed only if `phase === 'WRK'` and `work_balance === 'N'`
2. Fetch transactions: `GET /api/statements/transactions/interim?acc={IBAN}&limit=100` — returns current business day transactions; paginate with `followId` while `exist_next_page === true`
3. Filter: only process transactions where `PR_PR === 'r'` (completed) and `FL_REAL === 'r'` (real)
4. Deduplicate: unique key is **`REF + REFN`** (official PrivatBank recommendation)
5. Send new transactions to Telegram (`TRANTYPE: 'C'` = incoming, `'D'` = outgoing)
6. Store processed keys + update `lastCheckedAt`

### Key modules in `lib/`

- **`privatbank.ts`** — PrivatBank API client (base URL: `https://acp.privatbank.ua`)
- **`telegram.ts`** — Telegram Bot API client (sendMessage)
- **`storage.ts`** — Storage interface with Vercel KV implementation. Designed to be the only file replaced when migrating to VPS (swap to SQLite or JSON file)
- **`types.ts`** — Shared TypeScript types

### PrivatBank API specifics

- Auth via `token` header (not `Authorization: Bearer`), plus `Content-Type: application/json;charset=utf-8` and `User-Agent: privatbank-tg-bot`
- Must specify `charset=utf-8` explicitly — default encoding is `cp1251`
- Requires TLS 1.2+
- Primary endpoint is `/api/statements/transactions/interim` (current business day, no date params needed)
- Alternative: `/api/statements/transactions?startDate=DD-MM-YYYY&endDate=DD-MM-YYYY` for historical queries

### Storage abstraction

```typescript
interface Storage {
  getProcessedKeys(): Promise<Set<string>>       // stored REF+REFN keys
  addProcessedKey(key: string): Promise<void>
  getLastCheckedAt(): Promise<string | null>
  setLastCheckedAt(timestamp: string): Promise<void>
}
```

The storage layer is intentionally isolated — changing hosting only requires replacing the storage implementation, not business logic.

## Environment Variables

```
PRIVATBANK_TOKEN     # Token from Privat24 Business (Автоклієнт API)
PRIVATBANK_ACCOUNT   # IBAN (UA...)
TELEGRAM_BOT_TOKEN   # Telegram Bot API token
TELEGRAM_CHAT_ID     # Target chat ID
```

## Cron Configuration

Defined in `vercel.json`: `*/5 * * * *` (every 5 minutes). Changeable without code modifications.

## Important Behaviors

- **First run:** saves current state without sending old transactions
- **Deduplication:** transactions are deduplicated by `REF + REFN` key — zero duplicates is a hard requirement
- **API unavailability:** log errors, don't crash; queue unsent notifications for retry
- **Daily heartbeat:** 09:00 Telegram message confirming the bot is alive

## Language Note

PRD and ADR documents are written in Ukrainian. Code, comments, and commit messages should be in English.
