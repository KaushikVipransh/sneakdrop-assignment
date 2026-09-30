# Project Context — Sneaker Drop

Hand-off file for new sessions. Read this first, then the docs it links.

## What this is

Take-home assignment for **Timebase** (timebasehq.com). Brief is in [README.md](README.md). Build a limited sneaker drop (20 pairs) that **never oversells**, with 5-minute holds, per-user limits (1 active hold, max 2 pairs), a FIFO waitlist with auto-promotion, and a fake payment provider whose webhooks arrive late, twice, or out of order.

Deliverables: code in this fork, `NOTES.md` (how to run + requirements), screen recording.

## Planning docs (read in this order)

1. [docs/PRD.md](docs/PRD.md) — goals, user stories, features, edge cases, success metrics, assumptions (§12).
2. [docs/TECH_STACK.md](docs/TECH_STACK.md) — stack + justification, architecture, data model.
3. [docs/DESIGN.md](docs/DESIGN.md) — "The Ledger" design system, tokens, 12 card states, admin layout.
4. [docs/TODO.md](docs/TODO.md) — **the build order.** 67 atomic tasks, T01–T67, milestones M0–M6.

## Stack (decided — do not re-litigate)

TypeScript · Next.js 16 App Router (UI + Route Handlers) · Tailwind v4 + shadcn/ui · TanStack Query (1.5 s polling) · Zod · Drizzle ORM · Postgres (Neon in prod, Docker Postgres 17 locally) · Better Auth (anonymous + magic link via Resend) · Vercel Hobby · cron-job.org / QStash for a 1-minute reconcile call · Vitest + fast-check · autocannon/k6 · GitHub Actions. Package manager: **pnpm**.

## Key design decisions

- **Postgres is the single source of truth and the concurrency control.** Every mutation locks the drop row (`SELECT … FOR UPDATE`), runs `reconcile()`, then acts. No Redis. No stored stock counter; stock = `total − orders − active holds`, computed under the lock.
- **No in-memory timers.** Holds store `expires_at`. `reconcile()` expires holds and promotes waiters lazily on every request, plus a 1-minute external cron.
- **Queue first.** If anyone is waiting, freed pairs go to the queue, never to a new Buy click.
- **Limit = orders + active holds ≤ 2.**
- **Late `payment.succeeded`** (hold no longer ACTIVE) → no order, intent `REFUNDED`.
- **Webhook idempotency** via `webhook_events.event_id` PK; state-machine guards ignore out-of-order events.
- **Fake provider = outbox table** (`fakepay_deliveries`) + dispatcher doing real signed HTTP POSTs. Chaos settings: delay, duplicate, reorder, fail rates.
- Domain logic lives in `src/server/drop` and `src/server/fakepay` as plain TS; `src/app/api/*` routes are thin adapters.

## Working rules (from the user)

- Work **one TODO task at a time, in order.** Do not start the next task until the current one passes its "Done when" check and the quality gate (`pnpm typecheck && pnpm lint && pnpm test`).
- Check for errors and bugs after every task and fix them before moving on.
- Tick the task in `docs/TODO.md` and commit per task with Conventional Commits.
- Git commits, docs, and code comments are written in normal English.
- The user may enable "caveman mode" (terse replies) — that affects chat replies only.

## Environment notes

- Windows 11, VS Code. Shells: PowerShell (primary) and Git Bash.
- Windows filesystem is case-insensitive: renaming `notes.md` → `NOTES.md` needs a two-step `git mv`.
- `.gitignore` already covers `node_modules`, `.next`, `.env*` (except `.env.example`), `*.db`.

## Current status

- 2026-09-30: Planning done. PRD, tech stack, design, TODO written and committed.
- 2026-09-30: M0 + M1 done (T01–T20). Schema for drops/holds/orders/audit_log, `inDropTx` (lock → DB clock → reconcile → action → invariant), createHold/releaseHold, 1,000-user concurrency test.
- Docker Desktop is broken on this machine; `pnpm db:local` runs Postgres 17 from npm binaries on the same port/credentials.
- 2026-09-30: M2 + M3 done (T21–T38). Waitlist + promotion, fast-check property test, fake provider outbox + dispatcher, signed webhook route, chaos e2e tests. 92 tests.
- 2026-09-30: M4 done (T39–T54). Better Auth guest + magic link, API routes, status route, cron route, Ledger UI (12 card states), Playwright e2e + axe (`pnpm e2e`, needs `pnpm dev`).
- 2026-10-01: M5 local work done (T55–T59), CI workflow written (T60 unticked until pushed), NOTES.md (T65), final review + 2 fixes (T66). 183 tests.
- 2026-10-01: M6 deploy done (T60–T64). Live: https://sneakdrop-vipransh-kaushiks-projects.vercel.app. Neon project spring-hat-70457001; Vercel project sneakdrop; GH Actions cron every 5 min.
- **Waiting on user:** 1-minute cron-job.org job (optional), screen recording (T67, see docs/RECORDING.md).
