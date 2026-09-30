# Screen recording — shot list (about 6 minutes)

Everything below runs locally (`pnpm dev`, plus `pnpm dev:cron` in a second terminal). Start from a clean state with `pnpm db:reset`. Open the app in two browsers, A and B (for example Chrome and a private window), and open `/admin` in a third tab signed in as an admin.

1. **The problem (30 s).** Show README rules 1–5. Say that the last drop sold 51 pairs against 20, and that the fix is one Postgres row lock per drop with stock computed from rows.
2. **Buy and pay (60 s).** In A, click Buy. Point at the orange square, the countdown, and the "Hold created" receipt line. Click Pay now, watch "Processing…" and then "It's yours." Show the "order created" row in the admin webhook table.
3. **Limits (20 s).** In A, click Buy another. Point out that the card cannot go past 2 pairs, and that a second Buy while holding returns the same hold.
4. **Waiting line and promotion (60 s).** Run `pnpm db:reset`, then run `update drops set total_stock = 1` (or reset through admin and buy 20 with the load test). In A, Buy. In B, the page shows Sold out; click Join the line and see "#1". In A, click Release. B switches to "Your turn." with a fresh 5:00 and the tab title changes.
5. **Duplicate webhook (45 s).** In admin, set Duplicates to 100% and save. Buy and pay in A. The admin webhook table shows "order created" followed by "duplicate — ignored". There is still exactly one order.
6. **Late webhook refund (60 s).** In admin, set Delay min to 360 s, Delay max to 360 s, Duplicates to 0%, and save. In A, Buy and Pay; the card shows Processing. To avoid waiting, run `update holds set expires_at = now() where status = 'ACTIVE'` and `update fakepay_deliveries set deliver_at = now()`. The hold expires, the webhook lands late, and the card shows "Payment too late — refunded". Admin shows "late — refunded" and Refunds 1.
7. **Load test (60 s).** Run `pnpm build && pnpm start`, then `pnpm loadtest --users 1000 --payRate 0.7 --chaos --reset`. Read out 20 HOLD_CREATED / 980 SOLD_OUT, orders ≤ 20, 0 5xx, PASS. Show the admin invariant badge (✓).
8. **Proof in tests (30 s).** Run `pnpm test src/server/drop/concurrency.test.ts`. Mention that removing `FOR UPDATE` makes it fail with 27–35 holds. Show the GitHub Actions run (green, including the 500-user load test) and the live URL.

When done, paste the video link into the "Screen recording" section of `NOTES.md`.
