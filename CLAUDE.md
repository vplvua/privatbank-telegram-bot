# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A single-user Telegram bot that polls PrivatBank's business API every 5 minutes for new FOP (sole proprietor) account transactions and sends formatted notifications. Deployed on Vercel as a cron-triggered serverless function with Upstash Redis for state persistence.

## Commands

- `npm run dev` — local dev server
- `npm run build` — production build (run before PRs to catch errors)
- `npx tsc --noEmit` — standalone type check
- No test framework yet; `npm run build` is the minimum verification

## Architecture

The entire app is one cron job with three integration modules:

```
Vercel Cron (every 5 min)
  → app/api/cron/route.ts     orchestrator: poll → dedupe → notify → persist
    → lib/privatbank.ts        PrivatBank API client (REST, Bearer token auth)
    → lib/telegram.ts          Telegram Bot API client (sendMessage)
    → lib/storage.ts           Upstash Redis via @upstash/redis
    → lib/types.ts             shared TypeScript interfaces
```

**Data flow:** cron fires → fetch interim transactions from PrivatBank → filter by `PR_PR === 'r' && FL_REAL === 'r'` → deduplicate using `REF + REFN` composite key against stored keys in Redis → send new transactions to Telegram → update stored keys.

**Storage model:** single Redis key `last_processed_txns` holding `{ processedKeys: string[], checkedAt: string }`. The storage layer (`lib/storage.ts`) is intentionally isolated for future migration to SQLite/JSON on a VPS.

## Key Design Decisions

- **Sliding window polling:** requests transactions for the last 10 minutes despite 5-minute cron interval — the overlap prevents missed transactions when the API lags
- **Deduplication key:** `REF + REFN` concatenation per PrivatBank's official recommendation
- **No `@vercel/kv`:** deprecated; this project uses `@upstash/redis` directly
- **Side-effect isolation:** `lib/` modules are pure clients; orchestration logic lives only in the route handler
- Detailed PrivatBank API reference in `docs/privatbank-api-reference.md`; product/architecture decisions in `docs/PRD-*.md` and `docs/ADR-*.md`

## Environment Variables

Required in `.env.local` (never committed):

```
PRIVATBANK_TOKEN, PRIVATBANK_ACCOUNT — bank API credentials
TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID — bot delivery target
UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN — auto-populated via Vercel Integration
```

## Coding Conventions

- TypeScript strict mode, 2-space indent
- Named exports in `lib/` modules
- `@/*` path alias instead of relative imports
- Lowercase filenames for modules; Next.js conventions for routes
- Commit style: `feat: ...`, `fix: ...`, `chore: ...` (short imperative subject)
