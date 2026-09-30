# Sneaker Drop — Build TODO

Source of truth for build order. Derived from [PRD.md](PRD.md), [TECH_STACK.md](TECH_STACK.md), [DESIGN.md](DESIGN.md).

## How to work this list

1. Do **one task at a time**, in order. Do not start task N+1 until task N is done.
2. Each task has a **Done when** line. Run that check.
3. After every task, run the **quality gate** (once the commands exist):
   ```
   pnpm typecheck && pnpm lint && pnpm test
   ```
4. If anything fails, fix it before moving on. Never skip a red check.
5. Tick the box (`[x]`) and commit with a Conventional Commit message (`feat:`, `fix:`, `test:`, `chore:`, `docs:`).
6. Update the "Current status" section in [../CONTEXT.md](../CONTEXT.md) at the end of each milestone.

---

## M0 — Project setup

- [x] **T01. Scaffold Next.js app.** `create-next-app` refuses a non-empty folder (`README.md`, `notes.md`, `src/` conflict). Scaffold into a temp folder (`pnpm create next-app@latest ../sneakdrop-tmp` with TypeScript, App Router, Tailwind, ESLint, `src/` dir, alias `@/*`), then move its files into the repo root. Keep existing `README.md`, `notes.md`, `.gitignore` (merge any new entries), `docs/`, `CONTEXT.md`, `CLAUDE.md`. Delete the empty `src/.gitkeep`.
  Done when: `pnpm dev` serves the default page at `http://localhost:3000`.
- [x] **T02. Strict TypeScript + scripts.** Enable `strict`, `noUncheckedIndexedAccess`. Add scripts: `typecheck` (`tsc --noEmit`), `lint`, `format` (Prettier), `test` (Vitest).
  Done when: `pnpm typecheck && pnpm lint` pass.
- [x] **T03. Vitest setup.** Install Vitest, add `vitest.config.ts` with `@/*` alias, add one trivial test.
  Done when: `pnpm test` passes.
- [x] **T04. Local Postgres.** `docker-compose.yml` with Postgres 17 (port 5432, volume). Add `.env.example` with `DATABASE_URL`, `DATABASE_URL_DIRECT`.
  Done when: `docker compose up -d` and `psql $DATABASE_URL -c 'select 1'` work.
- [x] **T05. Env validation.** `src/server/env.ts` parses env with Zod, fails fast on missing vars.
  Done when: app boots with `.env`; boot fails with clear message when `DATABASE_URL` is removed.

## M1 — Data model, atomic hold, expiry

- [x] **T06. Drizzle setup.** Install `drizzle-orm`, `drizzle-kit`, `pg` (local) / `@neondatabase/serverless` (prod). `src/server/db/client.ts` exports a pooled client and a `withTx()` helper.
  Done when: a script runs `select 1` through Drizzle.
- [x] **T07. Schema: `drops`.** `id`, `name`, `total_stock`, `hold_seconds` (default 300), `max_per_user` (default 2), `starts_at`, `created_at`.
  Done when: migration generates and applies cleanly.
- [x] **T08. Schema: `holds`.** `id`, `drop_id`, `user_id`, `status` enum (`ACTIVE`, `CONVERTED`, `EXPIRED`, `RELEASED`), `source` enum (`buy`, `waitlist`), `created_at`, `expires_at`, `ended_at`. Partial unique index `(drop_id, user_id) WHERE status = 'ACTIVE'`.
  Done when: migration applies; inserting two ACTIVE holds for one user fails with unique violation (test).
- [ ] **T09. Schema: `orders`.** `id`, `drop_id`, `user_id`, `hold_id` (unique), `created_at`.
  Done when: migration applies; duplicate `hold_id` insert fails (test).
- [ ] **T10. Schema: `audit_log`.** `id`, `entity`, `entity_id`, `from_status`, `to_status`, `meta` jsonb, `at`.
  Done when: migration applies.
- [ ] **T11. Seed script.** `pnpm db:seed` creates one drop with 20 pairs, `starts_at = now()`. `pnpm db:reset` truncates and reseeds.
  Done when: both commands run twice in a row without error.
- [x] **T12. Test DB harness.** Vitest global setup: use a separate `sneakdrop_test` DB, run migrations, truncate between tests.
  Done when: a DB test passes and leaves no rows behind.
- [ ] **T13. `lockDrop(tx, dropId)`.** `SELECT … FOR UPDATE` on the drop row; returns drop or throws `DropNotFound`.
  Done when: unit test passes.
- [ ] **T14. `getCounts(tx, dropId)`.** Returns `{ total, sold, held, available }` computed from rows (no stored counter).
  Done when: test with seeded holds/orders returns correct numbers.
- [ ] **T15. `reconcile(tx, dropId, now)` — expiry only.** Mark `ACTIVE` holds with `expires_at <= now` as `EXPIRED`, write audit rows. (Promotion added in M2.)
  Done when: test: expired hold becomes EXPIRED, unexpired stays ACTIVE.
- [ ] **T16. `createHold(userId, dropId)`.** In one tx: lock, reconcile, check user has no active hold, check `orders + active holds < max_per_user`, check `available ≥ 1`, insert hold with `expires_at = now + hold_seconds`. Return typed result: `HOLD_CREATED | ALREADY_HOLDING (returns existing) | LIMIT_REACHED | SOLD_OUT | NOT_STARTED`.
  Done when: unit tests cover every result type.
- [ ] **T17. Concurrency test.** 1,000 distinct users call `createHold` in parallel against 20 stock.
  Done when: exactly 20 `HOLD_CREATED`, 980 `SOLD_OUT`, zero errors. Run 5 times, same result.
- [ ] **T18. Same-user race test.** One user calls `createHold` 50 times in parallel.
  Done when: exactly 1 hold exists; all 50 calls return that hold or `ALREADY_HOLDING`.
- [ ] **T19. `releaseHold(userId, holdId)`.** Only owner, only ACTIVE; sets `RELEASED`.
  Done when: tests for owner / non-owner / already-terminal.
- [ ] **T20. Invariant helper.** `assertInvariant(tx, dropId)`: `orders ≤ total` and `orders + active holds ≤ total`. Called at the end of every mutating tx in dev/test (throws).
  Done when: a test that forces bad data makes it throw; all prior tests still pass.

## M2 — Waitlist and promotion

- [ ] **T21. Schema: `waitlist_entries`.** `id`, `drop_id`, `user_id`, `status` enum (`WAITING`, `PROMOTED`, `LEFT`, `SKIPPED`), `created_at`, `ended_at`. Partial unique `(drop_id, user_id) WHERE status = 'WAITING'`. Index `(drop_id, status, created_at)`.
  Done when: migration applies.
- [ ] **T22. `joinWaitlist(userId, dropId)`.** Lock, reconcile. Allowed only if `available = 0`, user has no active hold, user under limit. Idempotent: returns existing entry.
  Done when: tests for each rejection and for idempotency.
- [ ] **T23. `leaveWaitlist(userId, dropId)`.** Sets `LEFT`.
  Done when: test passes.
- [ ] **T24. `getWaitlistPosition(tx, dropId, userId)`.** 1-based count of `WAITING` entries created before the user's (tie-break by `id`).
  Done when: test with 5 users returns 1..5; after #2 leaves, #3 becomes 2.
- [ ] **T25. Promotion inside `reconcile`.** After expiry, while `available ≥ 1` and queue non-empty: take first `WAITING`; if user ineligible (has 2 pairs or active hold) mark `SKIPPED` and continue; else mark `PROMOTED` and create hold `source = waitlist`, `expires_at = now + hold_seconds`.
  Done when: tests: expiry promotes first user with fresh 5 min; ineligible user skipped; empty queue returns pair to stock.
- [ ] **T26. Queue-first rule in `createHold`.** If waitlist has `WAITING` entries, `createHold` returns `SOLD_OUT` even if a pair is momentarily free.
  Done when: test passes.
- [ ] **T27. Release triggers promotion.** `releaseHold` runs reconcile after release in the same tx.
  Done when: test: release → first waiter gets hold immediately.
- [ ] **T28. Randomised invariant test.** fast-check: random sequences of buy / release / expire (advance clock) / join / leave across 50 users.
  Done when: invariant never breaks over 500 runs; per-user limits never exceeded.

## M3 — Fake payment provider and webhooks

- [ ] **T29. Schema: `payment_intents`.** `id`, `hold_id`, `user_id`, `status` enum (`PENDING`, `SUCCEEDED`, `FAILED`, `REFUNDED`), `amount`, `created_at`, `updated_at`.
  Done when: migration applies.
- [ ] **T30. Schema: `webhook_events`.** `event_id` PK, `type`, `intent_id`, `payload` jsonb, `received_at`, `outcome` text.
  Done when: migration applies.
- [ ] **T31. Schema: `fakepay_deliveries` + `fakepay_settings`.** Deliveries: `id`, `event_id`, `type`, `intent_id`, `payload`, `deliver_at`, `attempts`, `status` (`PENDING`, `DELIVERED`, `DEAD`), `last_error`. Settings: single row with `min_delay_ms`, `max_delay_ms`, `duplicate_rate`, `reorder_rate`, `fail_rate`.
  Done when: migration applies; seed inserts default settings (all zero chaos).
- [ ] **T32. HMAC signing util.** `sign(payload, secret)` and `verify(header, payload, secret)` with timestamp + constant-time compare. Add `WEBHOOK_SECRET` to env schema.
  Done when: tests for valid, tampered, and stale signatures.
- [ ] **T33. `fakepay.createIntent(holdId)`.** Writes intent and schedules deliveries per chaos settings (success or fail by `fail_rate`; extra copies by `duplicate_rate`; opposite event after success by `reorder_rate`; random delay in range). Chaos RNG injectable for tests.
  Done when: tests with fixed seed produce expected delivery rows.
- [ ] **T34. `startPayment(userId, holdId)`.** Owner + ACTIVE + not expired + no existing PENDING intent; creates intent via fakepay. Idempotent.
  Done when: tests pass.
- [ ] **T35. `applyPaymentEvent(event)`.** Tx: insert into `webhook_events` (conflict → `duplicate`, return). Lock drop, reconcile. Then:
  - success + hold ACTIVE + not expired → hold `CONVERTED`, order created, intent `SUCCEEDED`;
  - success + hold not ACTIVE → intent `REFUNDED`, outcome `late_refunded`;
  - failed + intent PENDING → intent `FAILED`, hold `RELEASED`, reconcile (promotion);
  - failed + intent already SUCCEEDED → outcome `ignored_out_of_order`.
  Done when: unit test for every branch.
- [ ] **T36. Webhook route.** `POST /api/webhooks/payments`: verify signature (401 on fail), Zod-parse body, call `applyPaymentEvent`, return 200 for handled/duplicate/ignored.
  Done when: route tests for 401, 200 duplicate, 200 success.
- [ ] **T37. Dispatcher.** `fakepay.dispatchDue(limit)`: claims due `PENDING` deliveries (`FOR UPDATE SKIP LOCKED`), POSTs signed payload to the webhook URL, marks `DELIVERED` or retries with backoff (max 5, then `DEAD`).
  Done when: integration test with app server: delivery reaches webhook and is marked DELIVERED.
- [ ] **T38. Chaos scenario tests.** End-to-end with real DB:
  - duplicate success ×3 → 1 order;
  - success after 6 min → no order, refund, next waiter promoted;
  - failed after success → order kept;
  - failed then success (reordered) → hold released on fail, success refunded.
  Done when: all four pass and invariant holds.

## M4 — Auth, API, status page

- [ ] **T39. Better Auth setup.** Install, configure with Drizzle adapter + Postgres, generate its tables, mount `/api/auth/[...all]`. Enable anonymous plugin.
  Done when: visiting the app creates a guest session; `user` row exists.
- [ ] **T40. Magic link (optional path).** Resend provider, `RESEND_API_KEY` optional in env; in dev, log the link to console.
  Done when: sign-in link works locally; anonymous user links to email account.
- [ ] **T41. `requireUser()` helper.** Returns user or 401 for route handlers.
  Done when: test passes.
- [ ] **T42. Mutation routes.** `POST /api/drop/hold`, `POST /api/holds/[id]/release`, `POST /api/holds/[id]/pay`, `POST /api/drop/waitlist`, `DELETE /api/drop/waitlist`. Map domain results to HTTP (200 / 409 / 403 / 404) with stable JSON `{ code, message }`.
  Done when: route tests for each success and error code.
- [ ] **T43. Status route.** `GET /api/drop/status` per PRD §8.4 (`serverTime`, drop counts, `me` block). Runs reconcile. Triggers `dispatchDue` with `after()`.
  Done when: response matches Zod schema in test; shared type exported for client.
- [ ] **T44. Cron route.** `POST /api/cron/reconcile` protected by `CRON_SECRET` header; runs reconcile + `dispatchDue`. Dev-only interval runner (`pnpm dev:cron`) calls it every 10 s.
  Done when: 401 without secret; expiry happens with no browser open.
- [ ] **T45. Design tokens.** CSS variables from DESIGN.md §2 in `globals.css` (light + dark), Tailwind v4 `@theme` mapping, Geist + Geist Mono via `next/font`.
  Done when: a token test page renders both themes correctly.
- [ ] **T46. shadcn/ui base.** Add Button, Card, Toast (Sonner). Restyle to tokens.
  Done when: variants render per DESIGN.md §5.
- [ ] **T47. `useDropStatus` hook.** TanStack Query, `refetchInterval` 1500 ms, computes `serverOffset`.
  Done when: hook test with mocked fetch.
- [ ] **T48. `Countdown` component.** From `expiresAt` + `serverOffset`; warning < 60 s; `aria-live` throttled.
  Done when: component test with fake timers.
- [ ] **T49. `StockGrid` component.** 20 squares, states per DESIGN.md §3.2, hidden text summary.
  Done when: component test renders correct counts per state.
- [ ] **T50. Header, stats strip, `LiveDot`.** Per DESIGN.md §3.4.
  Done when: renders; no layout shift at 375 px.
- [ ] **T51. Main card state machine.** Pure function `deriveCardState(status)` → one of 12 states (DESIGN.md §3.3) + card UI for each.
  Done when: unit test covers all 12 states.
- [ ] **T52. Wire actions.** Buy, Pay, Release, Join, Leave buttons call routes, optimistic loading, toast on error, refetch on success.
  Done when: manual run: full happy path works in the browser.
- [ ] **T53. Receipt log.** Show user's audit events (add `GET /api/me/events` or include in status).
  Done when: events appear in order during a manual run.
- [ ] **T54. Accessibility + responsive pass.** Keyboard, focus rings, contrast, `prefers-reduced-motion`, 375 / 768 / 1280 px.
  Done when: axe (or Lighthouse a11y) shows no errors; no horizontal scroll at 375 px.

## M5 — Admin, load test, CI

- [ ] **T55. Admin guard.** `ADMIN_EMAILS` env; `/admin` and admin routes require it.
  Done when: non-admin gets 403.
- [ ] **T56. Admin data route.** Counts, invariant check, active holds, first 20 waiters, last 50 webhook events, refunds.
  Done when: route test.
- [ ] **T57. Admin page.** Layout per DESIGN.md §4, polling.
  Done when: renders live data during a manual run.
- [ ] **T58. Chaos controls + reset.** Update `fakepay_settings`; Reset drop with confirm dialog.
  Done when: changing settings changes delivery rows; reset clears state.
- [ ] **T59. HTTP load script.** `pnpm loadtest --users 1000 --payRate 0.7` creates guest users, fires Buy in parallel, pays for some, waits, prints holds / orders / refunds / p95 latency and PASS/FAIL on `orders ≤ 20`.
  Done when: PASS locally 3 runs in a row, with chaos on.
- [ ] **T60. GitHub Actions CI.** Postgres service, install, migrate, typecheck, lint, test.
  Done when: CI green on push.

## M6 — Deploy, docs, video

- [ ] **T61. Neon project.** Create DB, run migrations with direct URL, seed.
  Done when: `select count(*) from drops` = 1 on Neon.
- [ ] **T62. Vercel deploy.** Link repo, set env vars (`DATABASE_URL`, `WEBHOOK_SECRET`, `CRON_SECRET`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `ADMIN_EMAILS`, optional `RESEND_API_KEY`), same region as Neon.
  Done when: production URL loads status page with guest session.
- [ ] **T63. External cron.** cron-job.org (or QStash) calls `/api/cron/reconcile` every minute with secret.
  Done when: hold expires in prod with no browser open.
- [ ] **T64. Prod smoke + load test.** Run load script against prod with 300 users.
  Done when: PASS, invariant green in admin.
- [ ] **T65. NOTES.md.** Rename `notes.md` to `NOTES.md` (Windows is case-insensitive: `git mv notes.md tmp.md && git mv tmp.md NOTES.md`). Fill in: requirements (Node, pnpm, Docker), env vars, how to run, how to test, how to run load test, design decisions, assumptions (PRD §12), live URL.
  Done when: fresh clone following NOTES.md runs in < 5 minutes.
- [ ] **T66. Final review.** Re-read README rules 1–5 and tick each against code + tests. Run `/code-review`.
  Done when: every rule mapped to a test; no open review findings.
- [ ] **T67. Screen recording.** Show: rules overview, load test PASS, duplicate webhook, late webhook refund, waitlist promotion, admin invariant.
  Done when: Loom link added to NOTES.md.
