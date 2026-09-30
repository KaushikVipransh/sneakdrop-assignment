# Sneaker Drop — Tech Stack Recommendation (2026)

Companion to [PRD.md](PRD.md). Every choice below runs on a **free tier**. Free-tier limits change often; the numbers here are the ones to verify on each vendor's pricing page before launch.

---

## 1. What the PRD demands from the stack

The PRD reduces to a few hard technical needs. Every choice is judged against them.

| Need | Source | Implication |
|------|--------|-------------|
| **N1. Atomic, serialised stock changes** | G1, F1 | A database with real transactions and row locks. Stock must be derived from rows, not cached. |
| **N2. Time-based expiry and promotion** | G2, G4, F2, F4 | Expiry must not depend on an in-memory timer. Needs `expires_at` in the DB plus a trigger to reconcile. |
| **N3. Idempotent, order-tolerant webhooks** | G5, F6 | Unique constraints and a state machine in the DB. |
| **N4. A fake provider that delivers late / twice / out of order** | F5 | A durable outbox of scheduled deliveries. |
| **N5. Live status page** | G6, F7 | Polling (or SSE) with server time for countdowns. |
| **N6. Per-user identity** | F3, F8 | Lightweight auth, users stored in the same DB. |
| **N7. Easy to run and verify** | G7 | One repo, one language, one local command, automated stress test. |

The main conclusion: **Postgres is the source of truth and the concurrency control.** Everything else stays simple around it.

## 2. Recommended stack at a glance

| Layer | Choice | Free tier used |
|-------|--------|----------------|
| Language | **TypeScript** (end to end) | — |
| Frontend | **Next.js 16 (App Router) + React 19** | — |
| UI | **Tailwind CSS v4 + shadcn/ui** (only the few components needed) | — |
| Client data | **TanStack Query** (polling status every 1.5 s) | — |
| Backend | **Next.js Route Handlers** in the same app, domain logic in a plain TS module | — |
| Validation | **Zod** | — |
| ORM / migrations | **Drizzle ORM + drizzle-kit** | — |
| Database | **Neon Postgres** (prod) / **Postgres 17 in Docker** (local) | Neon Free plan |
| Auth | **Better Auth** (anonymous guest + email magic link) | Open source, data in our own Postgres |
| Email (magic link) | **Resend** | Resend free plan |
| Scheduler (sweep every minute) | **cron-job.org** or **Upstash QStash schedule** calling a protected endpoint | Both have free plans |
| Deployment | **Vercel Hobby** | Vercel Hobby plan |
| Testing | **Vitest** (unit + integration against real Postgres), **autocannon / k6** for load | — |
| CI | **GitHub Actions** with a Postgres service container | Free for public repos |
| Logging / errors | **pino** structured logs + Vercel logs; **Sentry** optional | Sentry free developer plan |

## 3. Choices and justification

### 3.1 Language — TypeScript everywhere

- One language for UI, API, fake provider, tests, and load script. The reviewer runs one toolchain (`pnpm`).
- Shared types between the status endpoint and the page remove a whole class of bugs.
- Zod schemas validate API input and webhook payloads, and produce the TS types.

### 3.2 Frontend — Next.js 16 + React 19

**Why**
- The page is small, but Next.js also gives us the API routes, the fake provider routes, and the admin page in a single deployable. This keeps the "one command to run" goal.
- Server Components render the first paint with real status (no loading flash at the moment of the drop).
- First-class deployment target for Vercel's free tier.

**Why not the alternatives**
- *Vite + React SPA*: great DX, but then we need a separate backend service and a second deploy. More moving parts for no gain here.
- *SvelteKit / Remix (React Router 7)*: equally capable. Next.js wins on ecosystem and on reviewer familiarity.

**UI libraries**
- **Tailwind v4**: design tokens from [DESIGN.md](DESIGN.md) map directly to CSS variables via `@theme`.
- **shadcn/ui**: copy-in components (Button, Dialog, Toast). No runtime dependency lock-in.
- **TanStack Query**: `refetchInterval` polling, retry, and focus refetch out of the box. Simpler and more robust on serverless than WebSockets.

### 3.3 Backend — Next.js Route Handlers + a framework-free domain module

```
src/
  server/
    drop/          # pure domain logic: reconcile(), createHold(), joinWaitlist(), applyPaymentEvent()
    fakepay/       # fake provider: intents, chaos scheduler, signed delivery
    db/            # drizzle schema + client
  app/api/...      # thin HTTP adapters that call server/drop and server/fakepay
```

**Why**
- The hard part is transaction logic, not HTTP. Keeping it in a plain module makes it easy to unit-test and to swap the HTTP layer later (for example to Hono or Fastify) without touching the rules.
- Route Handlers run as Vercel Functions. Each request is stateless and all state lives in Postgres, which matches N2 (no in-memory timers).

**Why not a separate long-running server (Fastify / NestJS / Go on Render or Railway)?**
- A long-running process is attractive for timers and WebSockets, but free tiers for always-on servers are weak in 2026: Render's free web services sleep when idle, Railway and Fly.io no longer offer a real permanent free tier.
- A sleeping server at drop time is a real risk. Serverless plus DB-driven expiry avoids it.

### 3.4 Concurrency design — Postgres locks, not Redis

This is the most important decision in the project.

**Approach**
- One `drops` row per drop. Every state-changing operation starts with `SELECT … FROM drops WHERE id = $1 FOR UPDATE`.
- Inside that lock: `reconcile()` (expire due holds, promote from waitlist), then the requested action.
- Available stock is computed as `total − orders − active holds` inside the lock. No separate counter to drift.
- Extra safety nets in the schema:
  - partial unique index: one `ACTIVE` hold per user;
  - partial unique index: one `WAITING` waitlist entry per user;
  - unique `event_id` on `webhook_events`;
  - unique `hold_id` on `orders` (one order per hold);
  - a check in `createHold()` and a test that `orders + active holds ≤ total` after every commit.

**Why this over Redis (Upstash) + Lua scripts**
- Redis would add a second source of truth. Holds would live in Redis and orders in Postgres, and keeping them consistent under late or duplicate webhooks is exactly the kind of bug that caused the 51-pair oversell.
- With 20 pairs, the lock is held for a few milliseconds. Serialising 1,000 requests through one row lock completes in well under a few seconds, which is acceptable for a drop. Throughput is not the bottleneck; correctness is.
- Easy to explain and easy to prove in the demo video.

**Known limit and upgrade path**
- For 100k+ requests per second, move the hot path to a Redis-based gate (atomic `DECR` + queue) that only admits as many requests as there is stock, then write to Postgres. Not needed for this brief.

### 3.5 Expiry and promotion — lazy reconcile + minute sweep

- `reconcile()` runs at the start of every locked transaction, and the status endpoint runs it too. During a drop, users poll every 1.5 s, so expiry and promotion happen within about 2 s of `expires_at`.
- A protected `POST /api/cron/reconcile` endpoint runs the same function once a minute, so expiry also happens when nobody is online.
- **Scheduler choice:** Vercel Hobby cron jobs run at most once per day, which is too slow. Use **cron-job.org** (free, 1-minute interval) or an **Upstash QStash** schedule to call the endpoint with a secret header.
- The promoted user's new hold gets `expires_at = now() + 5 min` at promotion time, as the PRD requires.

### 3.6 Fake payment provider — outbox table + dispatcher

- Lives in `src/server/fakepay` and exposes its own routes under `/api/fakepay/*`, so it behaves like an external service while staying in one repo.
- On `pay`, it writes the intent and one or more rows into `fakepay_deliveries` with a `deliver_at` time based on chaos settings:
  - `delayMs` range (e.g. 0 s – 7 min, so some arrive after the 5-minute hold);
  - `duplicateRate` (send the same `event_id` 2–3 times);
  - `reorderRate` (send `payment.failed` after `payment.succeeded`, or deliveries in shuffled order);
  - `failRate`.
- A dispatcher drains due rows and makes a **real HTTP POST** with an HMAC-SHA256 signature header to `/api/webhooks/payments`. Non-2xx responses are retried with backoff.
- The dispatcher is triggered by the minute cron and opportunistically after status polls (using Next.js `after()` so the user's response is not delayed).

**Why an outbox instead of `setTimeout` or a queue service**
- `setTimeout` does not survive serverless function shutdown.
- A hosted queue (QStash delayed messages) would work, but free message quotas are small for load tests with duplicates. The outbox is free, durable, deterministic in tests, and visible in the admin view.

### 3.7 Database — Neon Postgres (prod), Docker Postgres (local)

**Why Neon**
- Real Postgres: transactions, `FOR UPDATE`, partial unique indexes. All required by N1 and N3.
- Free plan with scale-to-zero and branching (a branch per preview deploy is useful for testing).
- The `@neondatabase/serverless` driver supports interactive transactions over WebSocket from Vercel Functions; use its `Pool` (not the one-shot HTTP `neon()` function) for the locked transactions.
- Use the **pooled** connection string in the app and the **direct** one for migrations.

**Why not the alternatives**
- *Supabase*: also real Postgres and a good free plan, but free projects pause after inactivity, and we would not use its auth/storage/realtime extras.
- *Turso / SQLite*: great for reads, but its single-writer model and fewer locking primitives make the concurrency story harder to demonstrate.
- *MongoDB Atlas*: document model and multi-document transactions work, but relational constraints (unique partial indexes, FK) express our invariants more directly.
- *Firebase / Firestore*: transaction retries under heavy contention on a single document degrade badly; poor fit for a 1,000-click hot spot.

**ORM — Drizzle**
- Thin, SQL-first. We can write `FOR UPDATE` and partial indexes directly. Tiny runtime, fast cold starts.
- *Prisma* is heavier and makes row-lock queries awkward (needs raw SQL anyway).

### 3.8 Auth — Better Auth

**Why**
- Open source, runs inside our Next.js app, and stores users and sessions in **our** Postgres. No monthly-active-user limit, no vendor cost, and user IDs are real foreign keys on holds and orders.
- **Anonymous plugin** lets a reviewer click Buy instantly with a guest session. **Magic link** (via Resend free plan) upgrades to a real email identity. For the load test, the script creates many anonymous users.
- Built-in rate limiting helps with F14.

**Why not the alternatives**
- *Clerk*: excellent DX and generous free MAU, but users live in Clerk, so holds and orders reference an external ID and the load test needs thousands of fake accounts on a hosted service.
- *Auth.js (NextAuth)*: still works, but its maintenance moved under the Better Auth team in 2025; new projects are pointed to Better Auth.
- *Supabase Auth*: fine, but ties us to Supabase as the DB.

**Limit to note:** email-based identity does not stop determined resellers. Real launches add phone verification, CAPTCHA (e.g. Cloudflare Turnstile, free), and payment-card fingerprinting. Out of scope per PRD.

### 3.9 Deployment — Vercel Hobby

**Why**
- Zero-config deploys for Next.js, preview URL per branch, HTTPS, env var management. Free Hobby plan fits a non-commercial assignment.
- Stateless functions fit the DB-driven design.
- Region: put the Vercel functions in the same region as the Neon database to keep lock hold time low.

**Watch-outs**
- Hobby plan is for non-commercial use. A real brand launch needs the Pro plan.
- Cron on Hobby is once per day; hence the external scheduler (3.5).
- Function duration limits: keep the dispatcher batch small and fast.

**Local run (for `NOTES.md`)**
- `docker compose up -d` (Postgres 17) → `pnpm i` → `pnpm db:migrate` → `pnpm dev`.
- In dev, a small interval loop replaces the external cron.

### 3.10 Testing and CI

| Test | Tool | What it proves |
|------|------|----------------|
| Unit: state machine, limits | Vitest | Each rule in the brief. |
| Integration: webhook chaos | Vitest + real Postgres | Duplicate, late, and reordered events give correct end state. |
| Concurrency: 1,000 parallel `createHold` | Vitest + `Promise.all` over a pool | Exactly 20 holds. |
| Property test: random event orderings | fast-check | Invariant `orders ≤ 20` for all generated orderings. |
| HTTP load test | autocannon or k6 against a running app | Latency and zero oversell under real HTTP. |
| CI | GitHub Actions + `services: postgres` | All of the above on every push. |

## 4. Architecture sketch

```
            Browser (status page, admin)
                 │  poll GET /api/drop/status (1.5 s)
                 │  POST /api/drop/hold | /waitlist | /holds/:id/pay
                 ▼
        ┌─────────────────────────────── Vercel ───────────────────────────────┐
        │  Next.js app                                                         │
        │   ├─ app/api/drop/*        ─┐                                        │
        │   ├─ app/api/webhooks/*     ├──▶ server/drop (reconcile, holds,      │
        │   ├─ app/api/cron/*        ─┘        waitlist, payment events)       │
        │   └─ app/api/fakepay/*     ───▶ server/fakepay (intents, outbox,     │
        │                                   dispatcher ── HTTP POST, HMAC ──┐  │
        │                                                                   │  │
        │           ▲ webhook ◀─────────────────────────────────────────────┘  │
        └───────────┼──────────────────────────────────────────────────────────┘
                    │ SQL (transactions, FOR UPDATE)
                    ▼
             Neon Postgres  ◀── cron-job.org / QStash (every minute → /api/cron/reconcile)
```

## 5. Data model (summary)

| Table | Key columns | Constraints |
|-------|-------------|-------------|
| `drops` | `id`, `total_stock`, `starts_at`, `hold_seconds` | Locked row for serialisation |
| `holds` | `id`, `drop_id`, `user_id`, `status`, `created_at`, `expires_at`, `source` (`buy` / `waitlist`) | Partial unique `(drop_id, user_id) WHERE status = 'ACTIVE'` |
| `waitlist_entries` | `id`, `drop_id`, `user_id`, `status`, `created_at` | Partial unique `(drop_id, user_id) WHERE status = 'WAITING'`; index on `(drop_id, created_at)` |
| `payment_intents` | `id`, `hold_id`, `status`, `amount` | FK to hold |
| `webhook_events` | `event_id` (PK), `type`, `payload`, `received_at`, `outcome` | PK gives idempotency |
| `orders` | `id`, `drop_id`, `user_id`, `hold_id`, `created_at` | Unique `hold_id` |
| `fakepay_deliveries` | `id`, `event_id`, `deliver_at`, `attempts`, `status` | Index on `(status, deliver_at)` |
| `audit_log` | `id`, `entity`, `entity_id`, `from`, `to`, `at`, `meta` | Append-only |
| Better Auth tables | `user`, `session`, `account`, `verification` | Managed by Better Auth |

## 6. Cost summary

| Service | Plan | Cost |
|---------|------|------|
| Vercel | Hobby | $0 |
| Neon | Free | $0 |
| Better Auth | Open source | $0 |
| Resend | Free | $0 |
| cron-job.org / Upstash QStash | Free | $0 |
| GitHub + Actions | Free (public repo) | $0 |
| Sentry (optional) | Developer | $0 |
| **Total** | | **$0 / month** |
