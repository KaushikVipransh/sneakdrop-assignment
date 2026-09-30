# Sneaker Drop — Design Document

Companion to [PRD.md](PRD.md) and [TECH_STACK.md](TECH_STACK.md). Scope for now: **minimal and modern**. One status page, one admin page, a small design system.

---

## 1. Reference and direction

### 1.1 What we take from Timebase ([timebasehq.com](https://www.timebasehq.com/#portfolio))

| Timebase trait | How we use it |
|----------------|---------------|
| Monochrome palette (white, black, greys) with high contrast | Neutral base for everything. Colour is reserved for meaning. |
| Large sans-serif display headings, clear hierarchy | One huge number on screen: pairs left. |
| Generous whitespace, stacked sections | Single column, wide margins, few elements per view. |
| Card grid for portfolio | Card surfaces for "Your hold" and "Your place in line". |
| Big metrics row ("0+ products", "$0M+ funding") | Stats strip: Sold / Held / Waiting. |
| Direct, confident, founder-style copy | Short, plain status lines: "It's yours for 4:12." |

### 1.2 What makes ours unique — "The Ledger"

The whole page is built around one idea: **every pair is visible.**

- **Stock grid.** 20 squares, one per pair. Each square shows its live state: available, held, sold. Users watch the drop happen instead of reading a counter. It also proves visually that there are never more than 20.
- **One signal colour.** Everything is black, white, and grey except a single accent, *Signal Orange*, used only for "live / yours / act now". If it is orange, it is about you.
- **Mono numerals.** All numbers (stock, countdown, queue position) use a monospaced font with tabular figures, like a trading terminal. Digits don't jump as they change.
- **Receipt-style timeline.** Below the main card, a thin log of your events ("10:00:03 Hold created", "10:02:41 Payment processing") styled like a receipt. It makes async payment states understandable.

Design keywords: **calm, exact, transparent.**

## 2. Design tokens

Defined as CSS variables and mapped into Tailwind v4 via `@theme`.

### 2.1 Colour

| Token | Light | Dark | Use |
|-------|-------|------|-----|
| `--bg` | `#FAFAF9` | `#0A0A0A` | Page background |
| `--surface` | `#FFFFFF` | `#141414` | Cards |
| `--surface-muted` | `#F2F2F0` | `#1C1C1C` | Empty grid squares, inputs |
| `--border` | `#E4E4E2` | `#262626` | Hairlines, card borders |
| `--text` | `#0A0A0A` | `#F5F5F4` | Primary text |
| `--text-muted` | `#6B6B6B` | `#A3A3A3` | Labels, secondary text |
| `--accent` | `#FF5A1F` | `#FF6A33` | Signal Orange: fills, your hold, live dot |
| `--accent-text` | `#C2410C` | `#FF8A5B` | Orange used as text (AA-compliant) |
| `--on-accent` | `#0A0A0A` | `#0A0A0A` | Text on orange fills |
| `--success` | `#15803D` | `#4ADE80` | Purchase confirmed |
| `--danger` | `#B91C1C` | `#F87171` | Expired, errors, refund |

Rules:
- Orange is never used for decoration. Only for: the live indicator, the user's own hold, the primary action.
- White text is never placed on orange; use `--on-accent`.
- Light mode is the default (matches Timebase). Dark mode follows `prefers-color-scheme`.

### 2.2 Typography

| Role | Font | Size / line height | Weight | Notes |
|------|------|--------------------|--------|-------|
| Display number (pairs left) | Geist Mono | `clamp(72px, 18vw, 160px)` / 1 | 500 | `font-variant-numeric: tabular-nums`, letter-spacing −0.04em |
| H1 | Geist | 40px / 1.1 (mobile 32px) | 600 | letter-spacing −0.02em |
| H2 | Geist | 24px / 1.2 | 600 | |
| Body | Geist | 16px / 1.5 | 400 | |
| Label | Geist | 13px / 1.4 | 500 | uppercase, letter-spacing 0.06em, `--text-muted` |
| Countdown | Geist Mono | 48px / 1 | 500 | tabular numerals |
| Receipt log | Geist Mono | 13px / 1.6 | 400 | |

Geist and Geist Mono are free (SIL OFL) and load with `next/font` with no layout shift.

### 2.3 Spacing, radius, elevation

- Spacing scale (px): 4, 8, 12, 16, 24, 32, 48, 64, 96.
- Page gutter: 16px mobile, 32px tablet, content max-width 720px (status) and 1120px (admin).
- Radius: 12px cards, 8px buttons and inputs, 4px grid squares.
- Elevation: none. Borders only (1px `--border`), in the flat Timebase style.

### 2.4 Motion

- Durations: 150ms (hover/press), 250ms (state change), 600ms (grid square fill).
- Easing: `cubic-bezier(0.2, 0, 0, 1)`.
- Grid square changing state: short colour fade. When the user's own square becomes orange, one subtle scale pulse (1 → 1.08 → 1).
- Live dot next to "LIVE": slow 2s opacity pulse.
- Countdown: no animation on digits; under 60s, the countdown text switches to `--danger`.
- All motion disabled under `prefers-reduced-motion: reduce`.

## 3. Page: Drop status (`/`)

### 3.1 Layout (desktop, 720px column)

```
┌──────────────────────────────────────────────────────────────┐
│ SNEAKER DROP                               ● LIVE   [guest ▾]│  header, 64px
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  AIR TIMEBASE 01 — "ZERO OVERSELL"                           │  label
│                                                              │
│  07                                                          │  display number
│  pairs left of 20                                            │  body muted
│                                                              │
│  ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ▣ ▣ ▣ □ □ □ □                      │  stock grid
│  ■ sold 13   ▣ held 3   □ available 4                        │  legend
│                                                              │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ YOUR HOLD                                            │    │  main card
│  │ 04:12                                                │    │  countdown
│  │ It's yours until 10:05:03. Pay before it runs out.   │    │
│  │ [ Pay now ]            Release                       │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  SOLD 13      HELD 3      WAITING 142                        │  stats strip
│                                                              │
│  ───────────── receipt ─────────────                         │
│  10:00:03  Hold created                                      │
│  10:00:51  Payment started                                   │
│  10:00:52  Payment processing…                               │
│                                                              │
│  You've bought 1 of 2 pairs.                                 │  footer note
└──────────────────────────────────────────────────────────────┘
```

Mobile: same order, single column, grid becomes 10 × 2, display number shrinks via `clamp`.

### 3.2 Stock grid

| Square state | Style |
|--------------|-------|
| Available | `--surface-muted` fill, 1px `--border` |
| Held (someone else) | `--text-muted` at 40% opacity, diagonal hatch pattern |
| Held (you) | `--accent` fill |
| Sold | `--text` fill (solid black / white in dark) |
| Sold (yours) | `--text` fill with small orange dot |

Order: sold squares fill from the left, then held, then available, so the grid reads like a progress bar.

Accessibility: the grid is `aria-hidden`; a visually hidden sentence carries the same data ("13 sold, 3 held, 4 available"). States differ by pattern as well as colour.

### 3.3 Main card — all states

The main card is the only thing that changes shape. One state at a time.

| State | Condition | Headline | Body | Primary action | Secondary |
|-------|-----------|----------|------|----------------|-----------|
| **Pre-sale** | now < `starts_at` | `Opens in 02:14:09` | "20 pairs. One per click. Max 2 per person." | Buy (disabled) | — |
| **Available** | stock > 0, no hold, < 2 bought | `Get a pair` | "We'll hold it for 5 minutes while you pay." | **Buy** | — |
| **Holding** | active hold | `04:12` (countdown) | "It's yours until 10:05:03." | **Pay now** | Release |
| **Last minute** | hold < 60s left | `00:42` in `--danger` | "Less than a minute left." | **Pay now** | Release |
| **Paying** | intent pending | `Processing…` | "Waiting for the payment provider. This can take a moment." | — (spinner) | — |
| **Purchased** | order created | `It's yours.` in `--success` | "Order #A1F3. You've bought 1 of 2." | Buy another (if < 2 and stock) | — |
| **Limit reached** | 2 bought | `That's your two.` | "Limit is 2 pairs per person." | — | — |
| **Sold out** | stock = 0, not in queue | `Sold out — for now` | "Holds expire. Join the line and we'll pass you the next free pair." | **Join the line** | — |
| **In line** | waiting | `#23` (mono, large) | "in line. When it's your turn you get a fresh 5 minutes automatically." | — | Leave line |
| **Promoted** | hold with `source = waitlist` | `Your turn. 05:00` | "A pair came back. It's held for you." | **Pay now** | Release |
| **Expired** | hold expired, no order | `Time's up` in `--danger` | "Your hold ran out and the pair went back." | Join the line / Buy | — |
| **Late payment** | payment refunded as late | `Payment too late — refunded` | "Your payment arrived after the hold ended. You were not charged." | Join the line | — |

Notes:
- The Promoted state also triggers the browser tab title change ("Your turn — Sneaker Drop") and, if permitted, a notification.
- Countdown is computed from `expiresAt − (Date.now() + serverOffset)`; the offset comes from `serverTime` in each status response.
- The countdown and queue position use `aria-live="polite"`; announcements are throttled (every 30s for the countdown, on change for position).

### 3.4 Header

- Left: wordmark "SNEAKER DROP" in Geist 600, uppercase, 14px, letter-spacing 0.08em.
- Right: live dot + "LIVE" label (or "OPENS 10:00" pre-sale, "ENDED" after), then account menu (guest / email, Sign out).

### 3.5 Receipt log

- Monospace lines, `HH:MM:SS  Message`. Newest at the bottom, max 8 lines, older ones collapse under "Show all".
- Dashed top border (receipt edge). Muted text; the latest line in `--text`.
- Events: hold created, promoted from line, payment started, payment processing, purchase confirmed, hold expired, released, late payment refunded, duplicate webhook ignored (admin only).

## 4. Page: Admin (`/admin`)

Minimal operator console, same tokens, wider (1120px).

```
┌─────────────────────────────────────────────────────────────────────────┐
│ SNEAKER DROP / ADMIN                                         ● LIVE     │
├─────────────────────────────────────────────────────────────────────────┤
│  TOTAL 20   SOLD 13   HELD 3   AVAILABLE 4   WAITING 142   REFUNDS 2    │  metric row
│                                                                         │
│  [■■■■■■■■■■■■■▣▣▣□□□□]  invariant: orders + holds ≤ 20  ✓              │
│                                                                         │
│  ┌── Active holds ───────────────┐  ┌── Waitlist (first 20) ─────────┐  │
│  │ user     source   expires in  │  │ #  user        joined           │  │
│  │ u_19a    buy      03:41       │  │ 1  u_7fe       10:00:04         │  │
│  │ u_4c2    waitlist 04:58       │  │ 2  u_a01       10:00:04         │  │
│  └───────────────────────────────┘  └─────────────────────────────────┘  │
│                                                                         │
│  ┌── Webhook events ────────────────────────────────────────────────┐   │
│  │ time      event_id   type               outcome                  │   │
│  │ 10:02:41  evt_91     payment.succeeded  order created            │   │
│  │ 10:02:43  evt_91     payment.succeeded  duplicate — ignored      │   │
│  │ 10:06:10  evt_77     payment.succeeded  late — refunded          │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  CHAOS  delay 0–420s [━━━━○━]  duplicates 30% [━━○━━]  reorder 20%      │
│  [ Reset drop ]   [ Run load test (1,000 users) ]                       │
└─────────────────────────────────────────────────────────────────────────┘
```

- Invariant badge shows a green check or a red "VIOLATION" block. It should never be red; it exists to make the guarantee visible in the demo.
- Outcome column uses text + colour: created (`--success`), duplicate / ignored (`--text-muted`), late / refunded (`--danger`).
- Reset drop asks for confirmation (irreversible for the current run).

## 5. Components

| Component | Variants | Notes |
|-----------|----------|-------|
| `Button` | primary (orange fill, `--on-accent` text), secondary (outline), ghost (text) | Height 48px on status page, 36px on admin. Full width on mobile. Loading state keeps width, shows spinner. |
| `Card` | default | `--surface`, 1px border, 12px radius, 24px padding (32px desktop). |
| `StockGrid` | size `lg` (status), `sm` (admin) | 20 squares, gap 6px, square size 100% / 20 of container on desktop. |
| `Countdown` | normal, warning (< 60s), expired | Mono, tabular nums, `aria-live`. |
| `Stat` | — | Label (uppercase muted) above mono number. |
| `LiveDot` | live, pre-sale, ended | 8px circle, orange when live. |
| `ReceiptLog` | — | Mono list with timestamps. |
| `Toast` | info, success, error | For network errors ("Couldn't reach server — retrying"). Bottom center, 4s. |

## 6. Copy guidelines

- Short, direct, confident, in the Timebase tone. No exclamation marks except "It's yours."
- Always say what happens next: "Join the line and we'll pass you the next free pair."
- Numbers are exact: "5 minutes", "2 pairs", "#23".
- Errors say what to do: "You already have a pair on hold. Pay or release it first."

## 7. Accessibility

- Contrast: all text meets WCAG 2.1 AA. Orange text uses `--accent-text` (≥ 4.5:1). Orange fills carry dark text.
- Keyboard: every action reachable by Tab; visible focus ring 2px `--text` with 2px offset.
- Screen readers: grid summary sentence; `aria-live` on countdown and position; state changes in the main card announced once.
- Touch targets ≥ 44px.
- Respect `prefers-reduced-motion` and `prefers-color-scheme`.

## 8. Responsive breakpoints

| Breakpoint | Width | Changes |
|------------|-------|---------|
| Mobile | < 640px | 16px gutter, grid 10 × 2, buttons full width, stats strip wraps to 3 columns |
| Tablet | 640–1024px | 32px gutter, grid 20 × 1 |
| Desktop | > 1024px | Status column 720px centred; admin two-column tables |

## 9. Out of scope for this version

- Product imagery and 3D shoe viewer (placeholder: a simple outline illustration or none).
- Marketing landing page, brand storytelling sections.
- Custom icon set (use Lucide where an icon is needed).
