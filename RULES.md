# Repository Rules

This file is a compact, portable rule set for AI coding assistants working in this repository. Treat it as an operational summary, not as a replacement for the source-of-truth documents in `docs/`.

## Product Scope

- v1 is intentionally narrow: one user, one FOP account, no UI, no analytics, no bot commands, and no multi-account support.
- The product goal is reliable Telegram notifications for new PrivatBank transactions within 5 minutes.
- The bot must not send duplicate notifications and must not miss transactions during normal operation.

## Architecture Rules

- The app is a scheduled Next.js 16 App Router project deployed on Vercel.
- The cron entrypoint is `app/api/cron/route.ts`.
- Keep integration modules in `lib/`:
  - `lib/privatbank.ts` for PrivatBank API access
  - `lib/telegram.ts` for Telegram delivery
  - `lib/storage.ts` for persistence
  - `lib/types.ts` for shared contracts
- Keep side effects in the cron route handler; `lib/*` modules should stay as focused clients/helpers.

## Transaction Processing Rules

- Poll PrivatBank on a fixed 5-minute schedule.
- Prefer the interim statements flow as the primary transaction source unless project docs are updated.
- On first run, initialize state from the current snapshot and do not notify historical transactions.
- Deduplicate transactions using the official composite key `REF + REFN`.
- Only notify for real posted transactions: `PR_PR === 'r' && FL_REAL === 'r'`.
- Telegram messages should distinguish incoming vs outgoing transactions and include amount, currency, description/purpose, and transaction timestamp.
- Preserve heartbeat/"bot alive" behavior if it already exists or is introduced from the documented scope.

## Storage Rules

- Persistent state for v1 is abstracted behind `lib/storage.ts`.
- The current storage target is Upstash Redis; do not couple business logic directly to a specific storage vendor.
- When changing storage internals, preserve the external storage contract and migration simplicity.

## Security Rules

- Never commit `.env.local`, tokens, chat IDs, IBANs, or full account identifiers.
- Do not print secrets into logs, errors, screenshots, test fixtures, or docs.
- When adding logs, prefer operational metadata over raw API payloads.

## Documentation Rules

- Use `docs/` as the source of truth for product and architecture decisions:
  - `docs/PRD-privatbank-telegram-bot.md`
  - `docs/ADR-privatbank-telegram-bot.md`
  - `docs/privatbank-api-reference.md`
- If implementation diverges from documented behavior, update docs or explicitly call out the mismatch.
- Do not invent Next.js/Vercel behavior from memory when the local docs or installed version should be checked.

## Coding Rules

- Use TypeScript with `strict` mode and 2-space indentation.
- Prefer named exports in `lib/`.
- Use the `@/*` path alias instead of deep relative imports.
- Keep filenames lowercase except for framework-mandated conventions like `route.ts`.
- Avoid unnecessary abstractions; this project is intentionally small.

## Verification Rules

- Minimum verification for meaningful changes is `npx tsc --noEmit` or `npm run build`.
- Run `npm run build` before opening a PR when changes affect runtime behavior.
- For logic-heavy changes, add tests if a test framework is introduced; prioritize deduplication, formatting, and storage behavior.

## Change Discipline

- Preserve the polling, deduplication, and first-run invariants unless the product docs are intentionally changed.
- Prefer small, local changes over broad refactors.
- When in doubt, optimize for reliability and debuggability over cleverness.
