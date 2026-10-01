# Notes — Sneaker Drop

A limited sneaker drop (20 pairs) that cannot oversell: 5-minute holds, 1 hold and 2 pairs per person, a first-come-first-served waiting line with automatic promotion, and a fake payment provider whose webhooks arrive late, twice, or out of order.

- **Live:** https://sneakdrop-one.vercel.app (Vercel `iad1` + Neon Postgres `us-east-1`). Admin: `/admin`.
- **Stack:** TypeScript · Next.js 16 (App Router, route handlers) · Postgres 17 · Drizzle ORM · Better Auth (guest + magic link) · TanStack Query · Tailwind v4 · Vitest + fast-check · Playwright.
- **Planning docs:** [docs/PRD.md](docs/PRD.md), [docs/TECH_STACK.md](docs/TECH_STACK.md), [docs/DESIGN.md](docs/DESIGN.md), [docs/TODO.md](docs/TODO.md).

## Requirements

| Tool     | Version                                                                                                      |
| -------- | ------------------------------------------------------------------------------------------------------------ |
| Node.js  | 22 or newer (developed on 24)                                                                                |
| pnpm     | 10 (`corepack enable` picks the version from `package.json`)                                                 |
| Postgres | 17, via **Docker** (`docker compose`) **or** the bundled no-Docker server (`pnpm db:local`, Windows x64/ARM) |

No other services are needed locally. Email is optional: without `RESEND_API_KEY`, magic sign-in links are printed in the server console.

## How to run (about 3 minutes)

```bash
pnpm install
cp .env.example .env            # dev defaults work as-is

# Start Postgres 17 — pick one:
docker compose up -d            # creates databases sneakdrop and sneakdrop_test
pnpm db:local                   # no Docker: same port, user, and databases

pnpm db:setup                   # migrate + seed one drop with 20 pairs
pnpm dev                        # http://localhost:3000
```

Optional, in a second terminal: `pnpm dev:cron` calls the reconcile endpoint every 10 s, standing in for the production scheduler. Holds expire without it too, because every request reconciles first; the cron only matters when nobody has the page open.

Open **http://localhost:3000** in two different browsers (or one normal and one private window) to be two different buyers.

### Admin console

`/admin` shows live counts, the invariant badge, active holds, the line, every webhook (including ignored duplicates), and chaos controls.

1. Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env` (the app creates that account at startup), then sign in at `/admin` with them.
2. Or: `ADMIN_EMAILS` lists emails that may use a magic link (default `admin@example.com`); the link is printed in the `pnpm dev` console.

### Useful commands

| Command                                                    | What it does                                                                                                                                                          |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm db:reset`                                            | Clears all drop state (keeps users and chaos settings) and seeds a fresh 20-pair drop                                                                                 |
| `pnpm test`                                                | Unit + integration tests against the real `sneakdrop_test` database (~180 tests, ~3 min)                                                                              |
| `pnpm e2e`                                                 | Playwright browser tests; needs `pnpm dev` running (first time: `pnpm exec playwright install chromium`). **Resets the dev database.**                                |
| `pnpm loadtest --users 1000 --payRate 0.7 --chaos --reset` | 1,000 guests click Buy at once, 70% of winners pay, provider chaos on. Prints PASS/FAIL on orders ≤ 20. Run against `pnpm build && pnpm start` for realistic numbers. |
| `pnpm typecheck && pnpm lint && pnpm test`                 | Quality gate (also runs in GitHub Actions, plus a 500-user load test)                                                                                                 |

## Environment variables

| Variable                       | Required | Purpose                                                                                                                |
| ------------------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                 | yes      | Pooled Postgres URL used by the app                                                                                    |
| `DATABASE_URL_DIRECT`          | no       | Direct URL for migrations (Neon's non-pooler host)                                                                     |
| `DATABASE_URL_TEST`            | tests    | Database the test suite may wipe                                                                                       |
| `APP_URL`                      | no       | Public base URL; the fake provider POSTs webhooks to `APP_URL/api/webhooks/payments` (default `http://localhost:3000`) |
| `BETTER_AUTH_SECRET`           | yes      | Session signing secret, ≥ 32 chars                                                                                     |
| `WEBHOOK_SECRET`               | yes      | HMAC secret shared by the fake provider and the webhook route                                                          |
| `CRON_SECRET`                  | yes      | Bearer token the scheduler sends to `/api/cron/reconcile`                                                              |
| `ADMIN_EMAILS`                 | no       | Comma-separated admin emails                                                                                           |
| `RESEND_API_KEY`, `EMAIL_FROM` | no       | Send magic links by email instead of printing them                                                                     |
| `DB_POOL_MAX`                  | no       | Connection pool size (default 10)                                                                                      |

The app validates these at boot and refuses to start with a clear message if one is missing.

## How it works

**Postgres is the single source of truth and the concurrency control.** There is no Redis, no in-memory timer, and no stock counter.

- **One lock per drop.** Every change to holds, orders, or the line runs in one transaction that starts with `SELECT … FROM drops WHERE id = $1 FOR UPDATE` ([`inDropTx`](src/server/drop/tx.ts)). Concurrent Buys are serialised on that row, so two requests can never both see the last free pair.
- **Stock is computed, not stored:** `available = total − orders − active holds`, counted from rows under the lock. There is no counter to drift.
- **Time comes from the database.** The clock is read with `clock_timestamp()` after the lock is granted, so every server instance agrees on when a hold expires.
- **Lazy expiry + promotion.** Every locked transaction first runs [`reconcile()`](src/server/drop/reconcile.ts): it expires holds past `expires_at`, then hands each free pair to the first eligible person in line as a fresh 5-minute hold. A minute cron does the same when nobody is online.
- **The invariant is checked before every commit.** [`assertInvariant`](src/server/drop/invariant.ts) verifies `orders ≤ total`, `orders + active holds ≤ total`, and `orders + active holds ≤ 2` per user. A violation throws, which rolls the transaction back, so an oversold state can never be committed. Schema constraints back it up: one ACTIVE hold per user (partial unique index), one WAITING entry per user, one order per hold, one row per webhook event id.
- **Fast "sold out".** When no pair is free, nothing is due to expire, and the caller holds nothing, Buy answers `SOLD_OUT` from one read without the lock. That path never writes, so it cannot oversell; it keeps the 980 losing clicks from queueing behind the 20 winners.
- **Status polling is lock-free.** `GET /api/drop/status` reads a repeatable-read snapshot and only takes the lock when a hold is actually due.

### The fake payment provider

[`src/server/fakepay`](src/server/fakepay) behaves like an external service with an **outbox**:

1. **Pay** creates a `PENDING` intent and writes one or more rows to `fakepay_deliveries`, in the same transaction as the app's own checks.
2. A dispatcher claims due rows (`FOR UPDATE SKIP LOCKED` plus a 30 s lease) and makes **real HTTP POSTs**, signed with HMAC-SHA256 (`t=…,v1=…`, 5-minute replay window), to `/api/webhooks/payments`. Failures retry with backoff; after 5 attempts a delivery is marked `DEAD`. The dispatcher runs after Pay, on status polls, and from the cron.
3. **Chaos settings** (admin console): random delay range (e.g. 0–7 min, so some arrive after the hold ended), duplicate rate (the same event id 2–3 times), reorder rate (a contradicting `payment.failed` on its own delay, so it can land before or after the success), and fail rate.

The webhook handler ([`applyPaymentEvent`](src/server/drop/webhook.ts)) runs under the drop lock:

| Event arrives…                                 | Result                                                               |
| ---------------------------------------------- | -------------------------------------------------------------------- |
| success, hold still ACTIVE                     | hold `CONVERTED`, order created, intent `SUCCEEDED`                  |
| same event id again                            | `200`, no effect (recorded as "duplicate — ignored")                 |
| success after the hold expired or was released | no order; intent `REFUNDED` (the pair may already be someone else's) |
| failure while pending                          | intent `FAILED`, hold released, the next person in line is promoted  |
| failure after success                          | ignored; the order stays                                             |
| success after a failure                        | refunded                                                             |
| bad signature                                  | `401`                                                                |
| unknown intent                                 | `409`, so the provider retries                                       |

## The rules, and where each is proven

| README rule                                                                    | Enforced in                                        | Tests                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Buy holds one pair for 5 minutes; unpaid holds go back                      | `createHold`, `reconcile`                          | `holds.test.ts`, `reconcile.test.ts`, `cron/reconcile/route.test.ts`, `status/route.test.ts`                                                                                                                       |
| Never oversell under load                                                      | drop row lock + invariant                          | `concurrency.test.ts` (1,000 parallel Buys → exactly 20 holds, ×5; removing `FOR UPDATE` makes it fail with 27–35), `property.test.ts` (fast-check, 500 random sequences), `pnpm loadtest`                         |
| 2. One hold at a time, max 2 pairs                                             | `getUserStanding`, invariant, partial unique index | `holds.test.ts`, `concurrency.test.ts` (one user × 50 parallel clicks → 1 hold), `invariant.test.ts`, `schema.test.ts`, `e2e/status-page.spec.ts`                                                                  |
| 3. Waiting line; expired hold goes to the first in line with a fresh 5 minutes | `joinWaitlist`, `promoteWaiters`                   | `waitlist.test.ts`, `promotion.test.ts`, `holds.test.ts` (queue first, release promotes), `e2e/status-page.spec.ts` (promotion across two browsers)                                                                |
| 4. Fake payments; webhooks late, twice, out of order                           | `fakepay/*`, `applyPaymentEvent`                   | `provider.test.ts`, `signature.test.ts`, `webhook.test.ts`, `dispatcher.test.ts`, `chaos.test.ts` (duplicate ×3, 6-minute-late refund + promotion, failure after success, failure before success — over real HTTP) |
| 5. One page with pairs left, countdown, place in line                          | `DropPage`, `deriveCardState`                      | `card-state.test.ts` (all 12 card states), `main-card.test.tsx`, `countdown.test.tsx`, `use-drop-status.test.tsx`, `e2e/a11y.spec.ts` (axe: 0 WCAG 2.1 AA violations, keyboard, 375/768/1280 px)                   |

## Assumptions (PRD §12)

1. **"Max 2 pairs" includes an active hold:** `orders + active holds ≤ 2`. A user with 2 orders cannot hold a third.
2. **Queue first.** While anyone is waiting, a freed pair always goes to the line, never to a new Buy click.
3. **A late successful payment is refunded** and creates no order, even if the pair happens to be free. The rule is simple and predictable.
4. **A user can rejoin the line** after their hold expires, at the back.
5. **Identity:** a guest session is created on first visit, so Buy works in one click. A guest can add an email (magic link); their holds and orders move to the email account if that account has no drop activity yet. Real launches would need stronger anti-bot measures (CAPTCHA, phone, card fingerprinting).
6. **One drop at a time:** the site sells the most recently created drop.
7. **Waiting-line promotion needs no action** from the waiter: their page switches to "Your turn" with a fresh 5-minute countdown, and the tab title changes.

## Production

- **Hosting:** Vercel (functions in `iad1`) and Neon Postgres 17 (`us-east-1`). The app uses the pooled connection; migrations use the direct one.
- **Scheduler:** a GitHub Actions workflow ([`.github/workflows/cron.yml`](.github/workflows/cron.yml)) calls `POST /api/cron/reconcile` every 5 minutes (GitHub's minimum). For 1-minute expiry when nobody is online, a cron-job.org job calls the same URL every minute with the header `Authorization: Bearer <CRON_SECRET>`.
- **Admin sign-in in production:** open `/admin` and sign in with the shared admin email and password (`ADMIN_EMAIL` / `ADMIN_PASSWORD`). The credentials are sent with the submission, not stored in the repo. The magic-link option still works for emails in `ADMIN_EMAILS`; with no email provider, the link appears in the Vercel function logs.
- **Production load test** (300 guests, 70% of winners pay, chaos on: duplicates 50%, reorder 20%, fail 10%, delay 0–5 s):

  ```
  Buy x300 in 4.16s: { SOLD_OUT: 280, HOLD_CREATED: 20 }
  Buy latency ms: p50 2002 · p95 3880
  orders confirmed: 11 / 20 · refunds: 2 · duplicate webhooks ignored: 15
  max pairs per user: 1 · 5xx responses: 0
  PASS: orders ≤ 20
  ```

  The browser specs in `e2e/status-page.spec.ts` also pass against production.

## Known limits

- **Latency.** Buy p95 is about 4 s both locally (1,000 clicks on one laptop with an emulated Postgres) and in production (300 clicks, Neon at its smallest 0.25 CU compute, cold serverless functions). This misses the PRD target of 500 ms. Every winning click waits on one row lock, and each locked transaction makes several round trips to the database. Next steps: larger Neon compute, fewer queries per transaction, and for 100k+ requests/s an admission gate (e.g. Redis `DECR`) in front of the same Postgres transaction.
- Refunds are simulated (intent status `REFUNDED`); no money moves.
- Rate limiting is Better Auth's built-in limiter only.

## Screen recording

_Link added after recording. Script: [docs/RECORDING.md](docs/RECORDING.md)._
