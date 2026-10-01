# Screen recording guide

Target length: 7–8 minutes. Record locally, so you control stock, time, and chaos. Show the live site for a few seconds at the end.

## 1. Before you record (10 minutes, off camera)

**Recorder.** Use Loom (free, gives a share link) or OBS. Record the full screen with microphone on. Set the display to 1920×1080 and browser zoom to 100–110% so text is readable.

**Start the app in production mode** (faster than `pnpm dev`, and needed for a realistic load test):

```bash
pnpm db:local          # skip if Postgres is already running (or: docker compose up -d)
pnpm db:reset
pnpm build
pnpm start             # terminal 1 — leave running
pnpm dev:cron          # terminal 2 — leave running
```

`pnpm dev:cron` must print `200 {"ok":true,…}` every 10 seconds. A `401` means the server is not using `.env`: `pnpm start` runs in production mode and also loads `.env.production` / `.env.production.local` if they exist, so keep production secrets in a file Next does not read (for example `.env.neon`).

Keep **terminal 3** free for commands during the recording. Make its font large.

**Windows to arrange:**

| Window | What | Signed in as |
|--------|------|--------------|
| A — Chrome | `http://localhost:3000` | guest (buyer 1) |
| B — Chrome Incognito | `http://localhost:3000` | guest (buyer 2) |
| C — Edge (or Firefox) | `http://localhost:3000/admin` | admin: `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env` |
| Editor | VS Code with `README.md`, `src/server/drop/tx.ts`, `src/server/drop/webhook.ts` open | — |

Use a different browser for admin: one browser has one login, so signing in as admin in Chrome would replace buyer 1.

**Check once before recording:** in admin, all chaos sliders are at 0 and saved; the page shows 20 pairs.

**Tips.** Close notifications. Move slowly and pause a second after each click so the viewer can read the result. If you make a mistake, stop talking, redo the step, and trim later. Each scene below starts from a known state, so you can also record scene by scene and join the clips.

## 2. The script

Each scene lists what to **do** and what to **say**. The "say" lines are a guide; use your own words.

### Scene 1 — The problem and the idea (45 s)

**Do:** show `README.md` rules, then `src/server/drop/tx.ts`.

**Say:** "This is my solution to the Sneaker Drop assignment. Last time the brand sold 51 pairs when it had 20. The cause is a race: many requests read 'stock is available' before any of them writes. My fix is to make Postgres the single source of truth. Every change — buy, pay, release, join the line — runs in one transaction that first locks the drop's row. Inside that lock I expire old holds, hand free pairs to the waiting line, do the action, and then check an invariant: orders plus active holds can never exceed 20. If that check fails, the transaction rolls back. Stock is never stored; it is always counted from rows."

### Scene 2 — Buy, hold, pay (60 s) — rule 1

**Do:** window A. Click **Buy**. Point at the countdown, the orange tile on the orbit with the "You" tag, and "pairs left" dropping to 19. Click **Pay now**. Wait for "It's yours." Scroll to the receipt. Switch to admin (C) and point at the "order created" row.

**Say:** "Clicking Buy holds one pair for five minutes. The countdown comes from the server's expiry time, not a browser timer. Paying goes to a fake payment provider that I built. It does not confirm the order directly — it sends a signed webhook back to the app, like Stripe would, and only that webhook creates the order. The admin page shows the webhook and its outcome."

### Scene 3 — Limits (30 s) — rule 2

**Do:** window A. Click **Buy another**, then **Pay now**. The card shows "That's your two."

**Say:** "A user can hold one pair at a time and buy two in total. The limit counts orders plus the active hold, and it is enforced on the server under the same lock, with a unique database index as a backstop. Double-clicking Buy returns the same hold; it never creates a second one."

### Scene 4 — Sold out, the line, automatic promotion (75 s) — rule 3

**Do:** terminal 3:

```bash
pnpm db:reset
pnpm demo stock 1
```

Window A: **Buy** (0 pairs left). Window B: shows "Sold out — for now"; click **Join the line**; it shows "#1". Put A and B side by side. In A click **Release**. B switches to "Your turn." with a fresh 05:00.

**Say:** "I set stock to one pair to show the waiting line. Buyer one holds the only pair. Buyer two sees sold out and joins the line at position one. When buyer one releases — or when a hold expires — the pair does not go back to open stock. In the same transaction it goes to the first person in line, with a fresh five minutes. Buyer two did nothing: the page updated by itself and the tab title changed. A new Buy click can never jump the line."

### Scene 5 — Duplicate webhook (45 s) — rule 4, "twice"

**Do:** admin (C): set **Duplicates** to 100%, click **Save chaos**. Window B: **Pay now**. Admin: webhook table shows "order created" and then "duplicate — ignored". Point at Sold = 1.

**Say:** "Real payment providers send messages more than once. I told my fake provider to send every event two or three times. The first one created the order. The copies were recognised by their event id and ignored. One payment, one order."

### Scene 6 — Late webhook (60 s) — rule 4, "late"

**Do:** terminal 3: `pnpm db:reset`. Admin: Duplicates 0%, **Delay min** and **Delay max** both about 360 s, **Save chaos**. Window A: **Buy**, **Pay now** — the card shows "Processing…". Terminal 3:

```bash
pnpm demo fast-forward
```

Within a few seconds A shows "Payment too late — refunded". Admin: webhook row "late — refunded", Refunds = 1, Sold = 0.

**Say:** "Now the provider is slow: the success message arrives six minutes after I pay, but the hold lasts five. To avoid waiting on camera, this command moves the clock forward: the hold expires now and the webhook is due now. The hold expired first, so when the success message arrived there was nothing to convert. The app did not create an order — the pair may already belong to someone else — and it refunded the payment instead. The user sees exactly what happened."

### Scene 7 — Out of order (30 s) — rule 4, "wrong order"

**Do:** show `src/server/drop/webhook.ts` (the table in `NOTES.md` under "The fake payment provider" also works).

**Say:** "Out-of-order events are handled by the same state machine. A failure that arrives after a success is ignored and the order stays. A failure that arrives first releases the hold, and the later success is refunded. All of this is covered by tests that send real signed HTTP webhooks."

### Scene 8 — Load test (75 s) — the main claim

**Do:** admin: set Delay min and max back to 0, save. Terminal 3:

```bash
pnpm loadtest --users 1000 --payRate 0.7 --chaos --reset
```

While it runs, show the admin page filling up. When it ends, read the result lines. Point at the green invariant badge in admin.

**What to expect.** Sold will be about 12–14, not 20: only 70% of the 20 winners pay, and chaos fails some payments. The unpaid pairs stay held, expire after five minutes, and pass to the next people in line, who are simulated users that never pay. So the page keeps showing Sold + Held = 20 with a long line, and every five minutes the held pairs move down the line. That is correct behaviour, not a stuck test. To show 20 of 20 sold instead, run `pnpm loadtest --users 1000 --payRate 1 --reset` (everyone pays, no chaos).

The script leaves chaos switched on. Afterwards run `pnpm db:reset` and save all chaos sliders at 0.

**Say:** "This is the test that matters. One thousand different users click Buy at the same moment, 70 percent of the winners pay, and the provider is in chaos mode: duplicates, failures, contradicting events, random delays. Result: exactly 20 holds, 980 sold-out answers, orders never above 20, no user above two pairs, zero server errors. The invariant badge stays green."

### Scene 9 — Proof and wrap-up (45 s)

**Do:** show `NOTES.md` → the table "The rules, and where each is proven". Show the GitHub Actions page (green run). Open the live site `https://sneakdrop-one.vercel.app` for a few seconds.

**Say:** "Every rule from the brief maps to automated tests: about 190 unit and integration tests against a real Postgres, a property test with 500 random sequences, and browser tests. One test fires a thousand parallel buys; if I remove the row lock, that test fails with 27 to 35 holds, so it really guards against overselling. CI runs all of it plus a 500-user load test on every push. The app is deployed on Vercel with Neon Postgres. One honest limit: under a thousand simultaneous clicks, Buy takes a few seconds at the 95th percentile, because winners wait on one lock — it is slower than my target, but it is never wrong. Thank you."

## 3. After recording

1. Trim mistakes, and check the audio is clear.
2. Upload (Loom link or unlisted YouTube). Make sure the link opens in a private window.
3. Paste the link under "Screen recording" in `NOTES.md`, commit, and push.
4. Run `pnpm db:reset` and set chaos back to 0.
