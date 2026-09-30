"use client";

import { useEffect } from "react";
import { useDropActions } from "@/hooks/use-drop-actions";
import { useDropStatus } from "@/hooks/use-drop-status";
import { useNow } from "@/hooks/use-now";
import { deriveCardState } from "@/lib/card-state";
import type { DropStatus } from "@/lib/status";
import { AccountMenu } from "./account-menu";
import type { DropPhase } from "./live-dot";
import { MainCard } from "./main-card";
import { ReceiptLog } from "./receipt-log";
import { SiteHeader } from "./site-header";
import { StatsStrip } from "./stats-strip";
import { StockGrid, StockLegend } from "./stock-grid";

function phaseOf(status: DropStatus, now: number): DropPhase {
  if (now < Date.parse(status.drop.startsAt)) return "pre-sale";
  if (status.drop.sold >= status.drop.total) return "ended";
  return "live";
}

const TITLE = "Sneaker Drop";

/** The status page (DESIGN.md §3). */
export function DropPage() {
  const { status, serverNow, error, refetch } = useDropStatus();
  const now = useNow(serverNow);
  const { pending, run } = useDropActions();
  const card = status ? deriveCardState(status, now) : null;

  // A promotion off the line changes the tab title, so a background tab notices.
  useEffect(() => {
    document.title = card?.kind === "promoted" ? `Your turn — ${TITLE}` : TITLE;
  }, [card?.kind]);

  if (!status || !card) {
    return (
      <>
        <SiteHeader phase="live" startsAt={new Date()} />
        <main className="mx-auto w-full max-w-[720px] px-4 py-12 sm:px-8" aria-busy="true">
          <p className="label">
            {error ? "Couldn't reach the server — retrying" : "Loading the drop…"}
          </p>
          <div className="mt-6 h-[160px] w-2/3 animate-pulse rounded-[var(--radius-card)] bg-surface-muted" />
        </main>
      </>
    );
  }

  const { drop, me } = status;
  return (
    <>
      <SiteHeader
        phase={phaseOf(status, now)}
        startsAt={new Date(drop.startsAt)}
        account={me ? <AccountMenu email={me.email} isGuest={me.isGuest} /> : null}
      />
      <main className="mx-auto w-full max-w-[720px] space-y-10 px-4 py-10 sm:px-8 sm:py-14">
        <section aria-labelledby="drop-name" className="space-y-6">
          <div>
            <h1 id="drop-name" className="label">
              {drop.name}
            </h1>
            <p className="display-number mt-4" aria-live="polite">
              {String(drop.available).padStart(2, "0")}
            </p>
            <p className="mt-2 text-text-muted">
              {drop.available === 1 ? "pair" : "pairs"} left of {drop.total}
            </p>
          </div>
          <StockGrid
            total={drop.total}
            sold={drop.sold}
            held={drop.held}
            available={drop.available}
            mineHeld={Boolean(me?.hold)}
            mineSold={me?.purchased ?? 0}
          />
          <StockLegend sold={drop.sold} held={drop.held} available={drop.available} />
        </section>

        <MainCard
          state={card}
          serverNow={serverNow}
          pending={pending}
          onAction={run}
          onExpire={() => void refetch()}
        />

        <StatsStrip sold={drop.sold} held={drop.held} waiting={drop.waitlistLength} />

        {me ? <ReceiptLog events={me.events} /> : null}

        {me ? (
          <p className="text-sm text-text-muted">
            You&apos;ve bought {me.purchased} of {me.limit} pairs.
          </p>
        ) : null}
      </main>
    </>
  );
}
