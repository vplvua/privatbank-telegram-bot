# Repository Guidelines

## Project Structure & Module Organization
This repository is a minimal Next.js 16 app using the App Router. Keep route handlers under `app/api/`; the scheduled entrypoint is [`app/api/cron/route.ts`](/Users/Pro/Projects/privatbank-telegram-bot/app/api/cron/route.ts). Put integration code in `lib/`: `privatbank.ts` for the bank client, `telegram.ts` for Telegram delivery, `storage.ts` for persistence, and `types.ts` for shared contracts. Product and architecture decisions live in `docs/` (`PRD`, `ADR`, API notes). Deployment cron settings are in [`vercel.json`](/Users/Pro/Projects/privatbank-telegram-bot/vercel.json). Local secrets belong only in `.env.local`.

## Project Invariants
- v1 scope is intentionally narrow: one user, one FOP account, no UI, no bot commands, no analytics, and no multi-account support.
- The bot polls PrivatBank on a fixed 5-minute schedule; keep [`vercel.json`](/Users/Pro/Projects/privatbank-telegram-bot/vercel.json) and the cron handler behavior aligned with that assumption.
- Use the PrivatBank interim statements flow as the primary polling mechanism unless the docs are explicitly revised.
- On first run, initialize state from the current snapshot and do not send historical transactions retroactively.
- Deduplicate transactions using the official composite key `REF + REFN`; do not rely on a single field when suppressing duplicates.
- Treat only real posted transactions as eligible notifications: `PR_PR === 'r' && FL_REAL === 'r'`.
- Persistent state for v1 lives behind [`lib/storage.ts`](/Users/Pro/Projects/privatbank-telegram-bot/lib/storage.ts) and should remain swappable; the current target is Upstash Redis.
- Telegram messages should distinguish incoming vs outgoing transactions and include amount, currency, description/purpose, and transaction timestamp.
- Heartbeat/"bot alive" reporting is part of the documented product scope and should be preserved unless the docs are updated.
- When implementation details are unclear, prefer the files in `docs/` as the source of truth over assumptions or older Next.js/Vercel patterns.

## Build, Test, and Development Commands
- `npm run dev` starts the local Next.js dev server.
- `npm run build` creates the production build and catches TypeScript/App Router issues.
- `npm run start` runs the built app locally.
- `npx tsc --noEmit` is the current standalone type check until a dedicated script is added.

## Coding Style & Naming Conventions
Use TypeScript with `strict` mode enabled and 2-space indentation. Prefer named exports in `lib/` modules and keep side effects inside route handlers, not API client helpers. Use lowercase filenames for modules (`lib/storage.ts`) and Next.js file conventions for routes (`route.ts`, `page.tsx`). Reuse the `@/*` path alias from `tsconfig.json` instead of long relative imports.

## Testing Guidelines
No test framework is configured yet. For new logic-heavy work, add tests alongside the feature or under `tests/` and include the command needed to run them in the same PR. Prioritize coverage for transaction deduplication, Telegram formatting, and storage behavior. At minimum, run `npm run build` before opening a PR.

## Commit & Pull Request Guidelines
The existing history uses short imperative subjects, sometimes Conventional Commit style, for example `chore: initial project setup`. Follow that format where possible: `feat: add PrivatBank polling client`, `fix: skip duplicate transactions`. PRs should include a concise summary, any required env vars or Vercel changes, linked issue/docs if relevant, and log snippets or screenshots when behavior is visible.

## Security & Framework Notes
Never commit `.env.local`, bot tokens, bank tokens, or account identifiers. Before changing Next.js behavior, read the relevant guide in `node_modules/next/dist/docs/` first; this project targets Next.js 16.2.2, and older conventions may be wrong.
