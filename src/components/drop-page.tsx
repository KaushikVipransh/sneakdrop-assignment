"use client";

import { useEffect, type ReactNode } from "react";
import { useDropActions } from "@/hooks/use-drop-actions";
import { useDropStatus } from "@/hooks/use-drop-status";
import { useNow } from "@/hooks/use-now";
import { deriveCardState } from "@/lib/card-state";
import type { DropStatus } from "@/lib/status";
import { cn } from "@/lib/utils";
import { AccountMenu } from "./account-menu";
import { formatRemaining } from "./countdown";
import type { DropPhase } from "./live-dot";
import { MainCard } from "./main-card";
import { ReceiptLog } from "./receipt-log";
import { SiteHeader } from "./site-header";
import { StatsStrip } from "./stats-strip";
import { StockOrbit } from "./stock-orbit";
import { Card } from "./ui/card";

function phaseOf(status: DropStatus, now: number): DropPhase {
  if (now < Date.parse(status.drop.startsAt)) return "pre-sale";
  if (status.drop.sold >= status.drop.total) return "ended";
  return "live";
}

const TITLE = "Sneaker Drop";
const LINKS = [
  { href: "#drop", label: "The drop" },
  { href: "#how", label: "How it works" },
  { href: "#faq", label: "FAQ" },
];

const STEPS = [
  {
    n: "01",
    title: "Click Buy",
    body: "One pair is held for you for exactly 5 minutes. Nobody else can take it.",
  },
  {
    n: "02",
    title: "Pay in time",
    body: "Pay before the countdown ends and the pair is yours. Max 2 pairs per person.",
  },
  {
    n: "03",
    title: "Sold out? Join the line",
    body: "When a hold runs out, the first person in line gets that pair with a fresh 5 minutes.",
  },
  {
    n: "04",
    title: "Never oversold",
    body: "Every pair is counted under one lock. There will never be more orders than pairs.",
  },
];

const FAQ = [
  {
    q: "What happens if I don't pay in 5 minutes?",
    a: "Your hold ends and the pair goes back. If people are waiting, the first person in line gets it automatically.",
  },
  {
    q: "Why can't I buy a third pair?",
    a: "The limit is 2 pairs per person, counting pairs you've bought plus the one you're holding.",
  },
  {
    q: "My payment arrived after my hold ended. Was I charged?",
    a: "No. A payment that arrives late is refunded automatically, because the pair may already be someone else's.",
  },
  {
    q: "Do I need an account?",
    a: "No. You shop as a guest in one click. Add your email from the menu to keep your pairs on any device.",
  },
];

function PillLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className="inline-flex h-10 items-center rounded-full bg-ink px-5 text-sm font-medium text-white ring-1 ring-white/20 hover:bg-[#241b47]"
    >
      {children}
    </a>
  );
}

function Legend() {
  const item = (swatch: string, label: string) => (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden className={cn("size-3 rounded-[4px]", swatch)} />
      {label}
    </span>
  );
  return (
    <p className="flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-white/80">
      {item("bg-ink ring-1 ring-white/40", "sold")}
      {item("hatch", "held")}
      {item("border border-white/60 bg-white/10", "available")}
      {item("bg-accent", "yours")}
    </p>
  );
}

/** The one-page drop site: gradient stage with the live action and the stock orbit. */
export function DropPage() {
  const { status, serverNow, error, refetch } = useDropStatus();
  const now = useNow(serverNow);
  const { pending, run } = useDropActions();
  const card = status ? deriveCardState(status, now) : null;

  // A promotion off the line changes the tab title, so a background tab notices.
  useEffect(() => {
    document.title = card?.kind === "promoted" ? `Your turn — ${TITLE}` : TITLE;
  }, [card?.kind]);

  const me = status?.me ?? null;
  const drop = status?.drop;
  const chip = me?.hold
    ? `You · ${formatRemaining(Date.parse(me.hold.expiresAt) - now)}`
    : me?.waitlistPosition
      ? `You · #${me.waitlistPosition} in line`
      : null;

  return (
    <>
      <SiteHeader
        phase={status ? phaseOf(status, now) : "live"}
        startsAt={new Date(drop?.startsAt ?? now)}
        links={LINKS}
        account={me ? <AccountMenu email={me.email} isGuest={me.isGuest} /> : null}
        cta={<PillLink href="#drop">Get yours</PillLink>}
      />

      <main className="flex-1">
        <section id="drop" aria-labelledby="drop-headline" className="px-3 pt-4 sm:px-6 sm:pt-6">
          <div className="stage mx-auto max-w-[1240px] rounded-[28px] shadow-[0_40px_100px_-40px_rgb(60_30_140/0.55)] lg:rounded-[40px]">
            <div className="grid items-center gap-10 px-5 pt-10 pb-8 sm:px-10 lg:grid-cols-[1.05fr_1fr] lg:gap-6 lg:px-14 lg:pt-16">
              <div className="space-y-7">
                <div className="space-y-4">
                  <p className="text-[13px] font-medium tracking-[0.14em] text-ink/75 uppercase">
                    {drop?.name ?? "Limited drop"}
                  </p>
                  <h1
                    id="drop-headline"
                    className="text-[44px] leading-[1.02] font-medium tracking-[-0.03em] text-ink sm:text-[64px] lg:text-[72px]"
                  >
                    {drop?.total ?? 20} pairs.
                    <br />
                    Zero oversell.
                  </h1>
                  <p className="max-w-md text-lg text-ink/80">
                    One per click. Five minutes to pay. Two per person. When it&apos;s gone, the
                    line gets the next pair.
                  </p>
                </div>

                {card && status ? (
                  <MainCard
                    state={card}
                    serverNow={serverNow}
                    pending={pending}
                    onAction={run}
                    onExpire={() => void refetch()}
                  />
                ) : (
                  <Card aria-busy="true" className="space-y-3">
                    <p className="label">
                      {error ? "Couldn't reach the server — retrying" : "Loading the drop…"}
                    </p>
                    <div className="h-10 w-2/3 animate-pulse rounded-full bg-surface-muted" />
                  </Card>
                )}

                {me ? (
                  <p className="text-sm text-ink/80">
                    You&apos;ve bought {me.purchased} of {me.limit} pairs.
                  </p>
                ) : null}
              </div>

              {drop ? (
                <StockOrbit
                  total={drop.total}
                  sold={drop.sold}
                  held={drop.held}
                  available={drop.available}
                  mineHeld={Boolean(me?.hold)}
                  mineSold={me?.purchased ?? 0}
                  chip={chip}
                  className="max-w-[360px] sm:max-w-[440px] lg:max-w-[480px]"
                />
              ) : (
                <div className="mx-auto aspect-square w-full max-w-[440px] animate-pulse rounded-full bg-white/10" />
              )}
            </div>

            <div className="stage-floor px-5 pt-10 pb-6 sm:px-10 lg:px-14">
              <div className="flex flex-col gap-4 border-t border-white/15 pt-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="lg:w-[520px]">
                  <StatsStrip
                    tone="dark"
                    sold={drop?.sold ?? 0}
                    held={drop?.held ?? 0}
                    waiting={drop?.waitlistLength ?? 0}
                  />
                </div>
                <Legend />
              </div>
            </div>
          </div>
        </section>

        <div className="mx-auto max-w-[1240px] space-y-20 px-4 py-20 sm:px-8">
          <section id="how" aria-labelledby="how-title" className="space-y-8">
            <div className="max-w-2xl space-y-3">
              <p className="label">How it works</p>
              <h2
                id="how-title"
                className="text-4xl font-medium tracking-[-0.02em] text-ink sm:text-5xl"
              >
                Fair by design.
              </h2>
            </div>
            <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((s) => (
                <li key={s.n}>
                  <Card className="h-full space-y-3">
                    <p className="num text-sm text-violet">{s.n}</p>
                    <h3 className="text-xl font-medium text-ink">{s.title}</h3>
                    <p className="text-text-muted">{s.body}</p>
                  </Card>
                </li>
              ))}
            </ol>
          </section>

          {me && me.events.length > 0 ? (
            <Card className="mx-auto max-w-2xl">
              <ReceiptLog events={me.events} />
            </Card>
          ) : null}

          <section id="faq" aria-labelledby="faq-title" className="mx-auto max-w-3xl space-y-6">
            <h2
              id="faq-title"
              className="text-4xl font-medium tracking-[-0.02em] text-ink sm:text-5xl"
            >
              Questions
            </h2>
            <div className="space-y-3">
              {FAQ.map((f) => (
                <details key={f.q} className="group glass rounded-3xl px-6 py-4">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 text-lg font-medium text-ink [&::-webkit-details-marker]:hidden">
                    {f.q}
                    <span
                      aria-hidden
                      className="grid size-8 shrink-0 place-items-center rounded-full bg-ink text-white transition-transform group-open:rotate-45"
                    >
                      +
                    </span>
                  </summary>
                  <p className="pt-2 pb-1 text-text-muted">{f.a}</p>
                </details>
              ))}
            </div>
          </section>
        </div>
      </main>

      <footer className="px-4 pb-10 text-center text-sm text-text-muted">
        Sneaker Drop · 20 pairs, zero oversell · Payments are simulated.
      </footer>
    </>
  );
}
