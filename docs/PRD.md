# Sneaker Drop — Product Requirements Document

| | |
|---|---|
| **Product** | Sneaker Drop — a fair, oversell-proof limited-release checkout |
| **Status** | Draft v1 |
| **Author** | Vipransh Kaushik |
| **Date** | 2026-09-30 |
| **Source** | `README.md` (Timebase take-home assignment) |

---

## 1. Background

A small shoe brand is launching one limited sneaker with exactly **20 pairs**. When the sale opens, thousands of people click **Buy** in the same second.

During the previous drop, the website sold **51 pairs against 20 in stock** and the brand refunded 31 customers. That is a correctness failure (race conditions on stock), a trust failure (customers who "bought" did not get shoes), and an operational cost (refunds, support load, reputation).

This project builds the full system for the next drop so that overselling cannot happen, even under heavy concurrency and unreliable payment notifications.

## 2. Problem statement

The old system checked stock and decremented it as two separate steps. Under concurrent load, many requests read "stock > 0" before any of them wrote the decrement. Payment confirmations were also trusted blindly, so late or duplicate confirmations created extra orders.

We need a system where:

- stock is reserved atomically at the moment a user clicks Buy,
- reservations expire and return to stock automatically,
- demand beyond stock is queued fairly instead of rejected, and
- payment notifications are processed safely no matter how late, duplicated, or reordered they are.

## 3. Goals

| # | Goal | Why it matters |
|---|------|----------------|
| G1 | **Zero oversell.** Confirmed orders never exceed 20, under any load or event ordering. | The core failure of the last drop. |
| G2 | **Fair holds.** A click on Buy gives a 5-minute hold on one pair; unpaid holds return to stock on time. | Stops stock from being locked by abandoned carts. |
| G3 | **Enforced per-user limits.** Max 1 active hold per user, max 2 purchased pairs per user. | Spreads limited stock across more customers and reduces reseller hoarding. |
| G4 | **First-come, first-served waitlist.** When stock is 0, users join a queue; expired holds pass automatically to the next person with a fresh 5-minute hold. | Converts lost demand into sales and keeps the process fair. |
| G5 | **Robust payment handling.** The system handles payment webhooks that arrive late, twice, or out of order, and ends in a correct state every time. | Real payment providers behave this way. |
| G6 | **Clear live status.** One page shows pairs left, the user's hold countdown, and their waitlist position. | Users need to know where they stand without refreshing blindly. |
| G7 | **Easy to run and review.** One-command local setup, documented in `NOTES.md`, with an automated oversell stress test. | The reviewer must be able to verify the claims quickly. |

### Non-goals

- Real payment processing (card data, 3-D Secure, real refunds).
- Multiple products, sizes, or carts. One SKU, one pair per hold.
- Shipping, addresses, tax, invoices.
- Advanced bot protection (CAPTCHA, device fingerprinting). Noted as future work.
- Polished marketing pages. The status page is functional first; the design doc gives it a clean, minimal look.

## 4. Users and personas

| Persona | Description | Primary need |
|---------|-------------|--------------|
| **Buyer** | Sneaker fan who is online at launch time and clicks Buy fast. | Know immediately whether they got a pair and how long they have to pay. |
| **Waitlisted buyer** | Arrived after stock hit 0. | Know their place in line and get a hold automatically if one frees up. |
| **Brand operator** | Runs the drop for the brand. | Trust that sold count never exceeds stock; see live stock, holds, queue, orders. |
| **Payment provider (system actor)** | Our fake provider. | Deliver "payment succeeded" / "payment failed" events to our webhook. |
| **Reviewer (Timebase)** | Evaluates the assignment. | Run the project, trigger chaos, and verify correctness. |

## 5. Core concepts and definitions

| Term | Definition |
|------|------------|
| **Drop** | One sale event for one sneaker, with a fixed total stock (20). |
| **Hold** | A reservation of exactly one pair for one user, valid for 5 minutes from creation (or from promotion off the waitlist). |
| **Available stock** | `total − confirmed orders − active holds`. This is the "pairs left" number shown to users. |
| **Waitlist entry** | A user's place in the FIFO queue, created only when available stock is 0. |
| **Promotion** | Moving the first waitlisted user into a new hold when a pair frees up. |
| **Payment intent** | A fake payment attempt tied to one hold. |
| **Webhook event** | A signed message from the fake provider (`payment.succeeded`, `payment.failed`) with a unique `event_id`. |
| **Order** | A confirmed purchase. Created only from a valid `payment.succeeded` event for an active hold. |

### Hold state machine

```
            create (Buy or promotion)
                     │
                     ▼
                ┌─────────┐   payment.succeeded (in time)   ┌───────────┐
                │ ACTIVE  │ ──────────────────────────────▶ │ CONVERTED │  (order created)
                └─────────┘                                 └───────────┘
                 │       │
     5 min pass  │       │ user cancels / payment.failed
                 ▼       ▼
           ┌─────────┐ ┌───────────┐
           │ EXPIRED │ │ RELEASED  │
           └─────────┘ └───────────┘
```

`CONVERTED`, `EXPIRED`, and `RELEASED` are terminal. Any event that tries to move a hold out of a terminal state is recorded and ignored (or triggers a refund, see F6).

## 6. User stories

Stories use the format *As a …, I want …, so that …* with acceptance criteria (AC).

### Epic A — Buying

**US-1 — Reserve a pair**
As a buyer, I want a pair held for me when I click Buy, so that nobody else can take it while I pay.
- AC1: If available stock ≥ 1 and I have no active hold and I have bought fewer than 2 pairs, a hold is created and available stock drops by 1 atomically.
- AC2: The hold expires exactly 5 minutes after creation (server time).
- AC3: When 1,000+ users click Buy at the same moment with 20 in stock, exactly 20 holds are created and every other request gets a clear "sold out — join waitlist" response.
- AC4: Double-clicking Buy (or retrying the request) does not create a second hold. The Buy request is idempotent per user.

**US-2 — See my countdown**
As a buyer with a hold, I want to see a live countdown, so that I know how long I have to pay.
- AC1: The countdown is derived from the server's `expires_at`, not from a client-side 5-minute timer.
- AC2: When the countdown reaches 0, the page shows "Hold expired" and the Pay button is disabled.

**US-3 — Pay for my pair**
As a buyer with an active hold, I want to pay, so that the pair becomes mine.
- AC1: Clicking Pay creates a payment intent linked to my hold and hands off to the fake provider.
- AC2: My order is confirmed only after the app receives and validates a `payment.succeeded` webhook.
- AC3: While waiting for the webhook, the page shows "Payment processing".
- AC4: On confirmation the page shows "You got a pair" and my purchased count increases.

**US-4 — Cancel a hold**
As a buyer, I want to release my hold, so that someone else can get the pair if I change my mind.
- AC1: Cancelling releases the pair immediately and triggers waitlist promotion.

**US-5 — Respect the limits**
As a buyer, I want clear messages when I hit a limit, so that I understand why I cannot buy.
- AC1: With an active hold, Buy returns "You already have a pair on hold".
- AC2: With 2 confirmed pairs, Buy and Join waitlist return "Purchase limit reached (2 pairs)".
- AC3: The limit counts confirmed orders plus active holds, so a user with 1 order and 1 active hold cannot start a third.

### Epic B — Waitlist

**US-6 — Join the waitlist**
As a buyer who arrives after stock hits 0, I want to join a waiting line, so that I still have a chance.
- AC1: Join is offered only when available stock is 0.
- AC2: A user can hold only one waitlist entry at a time. Joining twice is idempotent.
- AC3: Users with an active hold or 2 confirmed pairs cannot join.

**US-7 — See my place in line**
As a waitlisted buyer, I want to see my position, so that I can decide whether to wait.
- AC1: Position is 1-based and counts only entries ahead of me that are still waiting.
- AC2: Position updates within 2 seconds of any change.

**US-8 — Get promoted automatically**
As a waitlisted buyer, I want to get a hold automatically when a pair frees up, so that I don't have to keep clicking.
- AC1: When a hold expires or is released, the first eligible waitlisted user receives a new hold with a full 5 minutes starting at promotion time.
- AC2: Promotion and the release of the old hold happen in the same transaction, so stock is never briefly "free" to a random Buy click while a queue exists.
- AC3: Users who became ineligible (reached 2 pairs) are skipped and removed from the queue.
- AC4: My page switches from "Position #N" to the hold countdown without a manual refresh.

**US-9 — Leave the waitlist**
As a waitlisted buyer, I want to leave the line, so that I stop waiting.

### Epic C — Payments (fake provider)

**US-10 — Simulated provider**
As a developer, I want a fake payment provider that behaves like a real one, so that the app is tested against realistic conditions.
- AC1: The provider sends signed webhooks (`payment.succeeded`, `payment.failed`) to the app.
- AC2: It supports chaos settings: delivery delay (e.g. 0–10 minutes), duplicate delivery, out-of-order delivery, and failure rate.
- AC3: Every event has a unique `event_id` and a `created_at` timestamp.
- AC4: The provider retries delivery when the app does not respond with 2xx.

**US-11 — Safe webhook processing**
As the brand operator, I want every webhook handled exactly once in effect, so that a messy provider cannot create extra orders.
- AC1: Duplicate `event_id`s are acknowledged with 2xx and have no further effect.
- AC2: An event for a hold that is already terminal does not change the hold.
- AC3: A `payment.succeeded` that arrives after the hold expired does not create an order; the payment is marked `late` and auto-refunded (fake refund).
- AC4: A `payment.failed` that arrives after a `payment.succeeded` for the same intent is ignored.
- AC5: Invalid signatures are rejected with 401.

### Epic D — Operator and reviewer

**US-12 — Live admin view**
As the brand operator, I want a view of stock, active holds, queue length, orders, and refunds, so that I can monitor the drop.

**US-13 — Reset and simulate**
As a reviewer, I want to reset the drop and run a load simulation, so that I can verify no oversell happens.
- AC1: A script fires N concurrent Buy requests from N users and reports: holds created, orders confirmed, refunds, and whether `orders ≤ 20`.

## 7. Feature list

Priority: **P0** = required by assignment, **P1** = strongly recommended for quality, **P2** = nice to have.

| ID | Feature | Priority | Notes |
|----|---------|----------|-------|
| F1 | **Atomic hold creation** | P0 | Single DB transaction with row lock on the drop (or conditional update). Checks stock, user hold, and user limit together. |
| F2 | **Hold expiry (5 min)** | P0 | `expires_at` stored on the hold. Expired holds are reconciled lazily inside every read/write transaction, plus a periodic sweep. |
| F3 | **Per-user limits** | P0 | 1 active hold (partial unique index), max 2 pairs (orders + active holds). |
| F4 | **FIFO waitlist with auto-promotion** | P0 | Promotion runs in the same transaction that frees a pair. New hold gets a fresh 5 minutes. |
| F5 | **Fake payment provider** | P0 | Separate module and routes. Creates intents, schedules signed webhook deliveries with chaos options. |
| F6 | **Idempotent webhook handler** | P0 | `webhook_events` table with unique `event_id`. State-machine guards. Late success leads to refund. |
| F7 | **Status page** | P0 | Pairs left, hold countdown, waitlist position, action buttons. Polls a status endpoint every 1–2 s. |
| F8 | **User identity** | P0 | Needed to enforce per-user limits. Lightweight sign-in (email magic link or guest session). |
| F9 | **Idempotent Buy / Join** | P1 | `Idempotency-Key` header or natural per-user uniqueness. |
| F10 | **Admin dashboard** | P1 | Read-only live view plus Reset drop and chaos controls. |
| F11 | **Load / oversell test** | P1 | Script that fires 1,000+ concurrent Buys and asserts `orders ≤ 20`. Runs in CI. |
| F12 | **Automated tests** | P1 | Unit tests for state machine; integration tests for duplicate, late, and reordered webhooks. |
| F13 | **Audit log** | P1 | Append-only log of hold, waitlist, payment, and order transitions for debugging. |
| F14 | **Rate limiting** | P2 | Per-user and per-IP limit on Buy to absorb click storms. |
| F15 | **Pre-sale countdown** | P2 | Buy is disabled until `drop.starts_at`. |
| F16 | **Real-time push (SSE)** | P2 | Replace polling if the platform allows long-lived connections. |

## 8. Functional requirements (detail)

### 8.1 Buy flow

1. Client calls `POST /api/drop/hold`.
2. Server opens a transaction and locks the drop row (`SELECT … FOR UPDATE`).
3. Reconcile: mark expired holds `EXPIRED`, then run promotions for each freed pair.
4. Reject if the user has an active hold, or `orders + active holds ≥ 2`.
5. If available stock ≥ 1 **and** the waitlist is empty, create the hold. Otherwise return `SOLD_OUT` with `canJoinWaitlist: true`.
6. Commit. Return the hold with `expires_at`.

Stock is never stored as a separately decremented counter. It is computed from rows under the same lock, so it cannot drift.

### 8.2 Payment flow

1. `POST /api/holds/:id/pay` creates a payment intent (status `PENDING`) and calls the fake provider.
2. Fake provider stores the intent and schedules one or more webhook deliveries according to chaos settings.
3. Webhook `POST /api/webhooks/payments`:
   - verify HMAC signature;
   - insert `event_id` into `webhook_events` (unique); if the insert conflicts, return 200 and stop;
   - lock the related hold and drop;
   - apply the transition only if the hold is `ACTIVE` and not past `expires_at`;
   - if success is late, mark payment `REFUNDED` and log it;
   - return 200.

### 8.3 Expiry and promotion

- Every state-reading or state-changing request runs `reconcile()` under the drop lock.
- A scheduled sweep (every minute) also runs `reconcile()` so expiry happens even with no traffic.
- Clients compute the displayed countdown from `expires_at − server_now` (server time returned with each status response) to avoid clock skew.

### 8.4 Status endpoint

`GET /api/drop/status` returns:

```json
{
  "serverTime": "2026-10-15T10:00:03.120Z",
  "drop": { "total": 20, "available": 0, "sold": 17, "held": 3, "waitlistLength": 142 },
  "me": {
    "hold": { "id": "h_123", "expiresAt": "2026-10-15T10:04:12.000Z", "status": "ACTIVE" },
    "waitlistPosition": null,
    "purchased": 1,
    "limit": 2,
    "payment": { "status": "PENDING" }
  }
}
```

## 9. Edge cases

| Case | Expected behaviour |
|------|--------------------|
| 5,000 Buy clicks in 1 second, 20 in stock | Exactly 20 holds. Others see sold-out + waitlist option. |
| Same user clicks Buy 10 times fast | One hold. Other requests return the existing hold. |
| Same user opens 2 tabs | Both tabs show the same hold; limit enforced server-side. |
| Webhook arrives twice | Second delivery is a no-op, 200 returned. |
| `payment.succeeded` arrives 7 minutes after hold creation | Hold already expired (and maybe given to the next user). No order. Payment auto-refunded. |
| `payment.failed` arrives after `payment.succeeded` | Ignored; order stays. |
| `payment.succeeded` arrives before the app finished writing the intent | Handler returns 5xx (or 409) so provider retries; or intent is looked up by `hold_id` metadata. |
| Waitlisted user already has 2 pairs when promoted | Skipped and removed; next user promoted. |
| Hold expires with nobody on the waitlist | Pair returns to available stock. |
| Server restarts mid-drop | No in-memory state; all state is in the DB, so nothing is lost. |
| Client clock is 3 minutes wrong | Countdown still correct, because it uses server time offset. |

## 10. Non-functional requirements

| Area | Requirement |
|------|-------------|
| **Correctness** | Invariant: `confirmed_orders ≤ total_stock` and `confirmed_orders + active_holds ≤ total_stock` at every commit. Enforced in DB, verified by tests. |
| **Concurrency** | Handle 1,000 concurrent Buy requests without errors other than intended `SOLD_OUT` / limit responses. |
| **Latency** | p95 Buy response < 500 ms at 1,000 concurrent requests on free-tier infrastructure. |
| **Freshness** | Status page reflects changes within 2 s. |
| **Durability** | All state persisted in Postgres. No critical state in memory. |
| **Security** | Webhooks signed with HMAC-SHA256 and a shared secret. Auth required for Buy, Pay, Join. Secrets only in env vars. |
| **Observability** | Structured logs per state transition with `user_id`, `hold_id`, `event_id`. |
| **Accessibility** | Status page meets WCAG 2.1 AA: live regions for countdown and position changes, keyboard operable. |
| **Operability** | One command to run locally (`docker compose up` or `pnpm dev` with a local Postgres). Documented in `NOTES.md`. |

## 11. Success metrics

### Primary (correctness — must be 100%)

| Metric | Target | How measured |
|--------|--------|--------------|
| Oversold pairs | **0** | `SELECT count(*) FROM orders` ≤ 20 after every load test run and every chaos run. |
| Refunds caused by oversell | **0** | Refunds only for late payments, never because stock ran out after payment. |
| Duplicate orders from duplicate webhooks | **0** | Chaos test sends every event 2–3 times. |
| Invariant violations in test suite | **0** | Property / stress tests over randomized event orderings. |

### Secondary (experience and efficiency)

| Metric | Target | How measured |
|--------|--------|--------------|
| Sell-through | 20/20 pairs sold when demand > 20 | Load test with simulated payers (e.g. 70% pay in time). |
| Hold-to-order conversion | Tracked (baseline) | `orders / holds created`. |
| Waitlist promotion latency | < 2 s after expiry under traffic; < 60 s with no traffic | Timestamp diff between `expired_at` and new hold `created_at`. |
| Buy endpoint p95 latency | < 500 ms at 1,000 concurrent | Load script output. |
| Status freshness | < 2 s | Poll interval + server response time. |
| Error rate (5xx) | < 0.1 % during load test | Logs. |

### Assignment-level (review)

| Metric | Target |
|--------|--------|
| Time for reviewer to run locally | < 5 minutes following `NOTES.md` |
| Automated tests covering rules 1–4 | 100 % of rules have at least one test |
| Demo video | Shows a load test, a late webhook, a duplicate webhook, and a waitlist promotion |

## 12. Assumptions and open questions

| # | Assumption / question | Current decision |
|---|-----------------------|------------------|
| A1 | Does "max 2 pairs" include an active hold? | Yes. `orders + active holds ≤ 2`. Prevents a user with 2 orders from holding a third. |
| A2 | Can a random Buy click take a freed pair while people wait in line? | No. If the waitlist is non-empty, freed pairs always go to the queue first. |
| A3 | Late successful payment after the pair went to someone else? | No order, auto-refund, user sees "Payment arrived too late — refunded". |
| A4 | Late successful payment while the pair is still unclaimed (no queue, stock free)? | Still refunded, for a simple and predictable rule. Could be revisited. |
| A5 | Can a user rejoin the waitlist after their hold expires? | Yes, at the back of the line. |
| A6 | Identity strength | Email magic link or guest session is enough for the assignment. Real launch would need stronger anti-bot measures. |

## 13. Milestones

| # | Milestone | Output |
|---|-----------|--------|
| M1 | Data model + atomic hold + expiry | Migrations, `reconcile()`, Buy endpoint, unit tests |
| M2 | Waitlist + promotion | Join/leave endpoints, promotion in reconcile, tests |
| M3 | Fake provider + webhook handler | Chaos settings, signed webhooks, idempotency tests |
| M4 | Status page + auth | UI per design doc, polling, countdown |
| M5 | Load test + admin view | Stress script, CI job, admin page |
| M6 | Docs + deploy + video | `NOTES.md`, live URL, Loom walkthrough |

## 14. Deliverables (from the assignment)

1. Code in a fork of the assignment repo.
2. `NOTES.md` with how to run the project and all requirements.
3. Screen recording that explains the project.
