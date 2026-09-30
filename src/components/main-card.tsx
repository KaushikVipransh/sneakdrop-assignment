"use client";

import type { ReactNode } from "react";
import type { CardState } from "@/lib/card-state";
import { cn } from "@/lib/utils";
import { Countdown, formatRemaining } from "./countdown";
import { Button } from "./ui/button";
import { Card } from "./ui/card";

export type CardAction = "buy" | "pay" | "release" | "join" | "leave";

type Props = {
  state: CardState;
  serverNow: () => number;
  pending: CardAction | null;
  onAction: (action: CardAction, holdId?: string) => void;
  /** Called when a countdown reaches zero, to refresh status right away. */
  onExpire?: () => void;
};

const clockTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

function Frame({
  label,
  headline,
  body,
  actions,
  tone,
}: {
  label: string;
  headline: ReactNode;
  body: ReactNode;
  actions?: ReactNode;
  tone?: "accent";
}) {
  return (
    <Card
      aria-labelledby="card-label"
      className={cn("space-y-4", tone === "accent" && "ring-2 ring-accent/70 ring-offset-0")}
    >
      <p id="card-label" className="label inline-flex items-center gap-2">
        <span
          aria-hidden
          className={cn("size-2 rounded-full", tone === "accent" ? "bg-accent" : "bg-violet")}
        />
        {label}
      </p>
      <div className="space-y-2">
        {headline}
        <div className="text-text-muted">{body}</div>
      </div>
      {actions ? (
        <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center">{actions}</div>
      ) : null}
    </Card>
  );
}

const H = ({ children, className }: { children: ReactNode; className?: string }) => (
  <h2
    className={cn(
      "text-[28px] leading-[1.1] font-semibold tracking-[-0.02em] text-ink sm:text-[34px]",
      className,
    )}
  >
    {children}
  </h2>
);

/** The one element on the page that changes shape (DESIGN.md §3.3). */
export function MainCard({ state, serverNow, pending, onAction, onExpire }: Props) {
  const busy = pending !== null;
  const primary = (action: CardAction, label: string, holdId?: string) => (
    <Button
      className="w-full sm:w-auto"
      loading={pending === action}
      disabled={busy}
      onClick={() => onAction(action, holdId)}
    >
      {label}
    </Button>
  );
  const secondary = (action: CardAction, label: string, holdId?: string) => (
    <Button
      variant="ghost"
      className="w-full sm:w-auto"
      loading={pending === action}
      disabled={busy}
      onClick={() => onAction(action, holdId)}
    >
      {label}
    </Button>
  );

  switch (state.kind) {
    case "pre-sale":
      return (
        <Frame
          label="Opens soon"
          headline={
            <H>
              Opens in{" "}
              <span className="num">
                {formatRemaining(Date.parse(state.startsAt) - serverNow())}
              </span>
            </H>
          }
          body="20 pairs. One per click. Max 2 per person."
          actions={
            <Button className="w-full sm:w-auto" disabled>
              Buy
            </Button>
          }
        />
      );
    case "available":
      return (
        <Frame
          label="Get a pair"
          headline={<H>Get a pair</H>}
          body="We'll hold it for 5 minutes while you pay."
          actions={primary("buy", "Buy")}
        />
      );
    case "holding":
    case "last-minute":
    case "promoted": {
      const { hold } = state;
      return (
        <Frame
          tone="accent"
          label={state.kind === "promoted" ? "Your turn" : "Your hold"}
          headline={
            <div className="flex items-baseline gap-3">
              {state.kind === "promoted" ? <H>Your turn.</H> : null}
              <Countdown expiresAt={hold.expiresAt} serverNow={serverNow} onExpire={onExpire} />
            </div>
          }
          body={
            state.kind === "last-minute"
              ? "Less than a minute left."
              : state.kind === "promoted"
                ? "A pair came back. It's held for you."
                : `It's yours until ${clockTime(hold.expiresAt)}. Pay before it runs out.`
          }
          actions={
            <>
              {primary("pay", "Pay now", hold.id)}
              {secondary("release", "Release", hold.id)}
            </>
          }
        />
      );
    }
    case "paying":
      return (
        <Frame
          tone="accent"
          label="Paying"
          headline={
            <H className="inline-flex items-center gap-3">
              <span
                aria-hidden
                className="animate-spin-slow size-6 rounded-full border-2 border-current border-r-transparent"
              />
              Processing…
            </H>
          }
          body="Waiting for the payment provider. This can take a moment."
        />
      );
    case "purchased":
      return (
        <Frame
          label="Purchase confirmed"
          headline={<H className="text-success">It&apos;s yours.</H>}
          body={`Order #${state.orderRef}. You've bought ${state.purchased} of ${state.limit}.`}
          actions={
            state.canBuyAnother
              ? primary("buy", "Buy another")
              : state.soldOut
                ? secondary("join", "Join the line for another")
                : undefined
          }
        />
      );
    case "limit-reached":
      return (
        <Frame
          label="Limit reached"
          headline={<H>That&apos;s your two.</H>}
          body={`Limit is ${state.limit} pairs per person.`}
        />
      );
    case "sold-out":
      return (
        <Frame
          label="Sold out"
          headline={<H>Sold out — for now</H>}
          body="Holds expire. Join the line and we'll pass you the next free pair."
          actions={primary("join", "Join the line")}
        />
      );
    case "in-line":
      return (
        <Frame
          label="Your place in line"
          headline={
            <p className="num text-[64px] leading-none font-medium" aria-live="polite">
              #{state.position}
            </p>
          }
          body="in line. When it's your turn you get a fresh 5 minutes automatically."
          actions={secondary("leave", "Leave line")}
        />
      );
    case "expired":
      return (
        <Frame
          label="Hold ended"
          headline={<H className="text-danger">Time&apos;s up</H>}
          body="Your hold ran out and the pair went back."
          actions={state.soldOut ? primary("join", "Join the line") : primary("buy", "Buy")}
        />
      );
    case "payment-failed":
      return (
        <Frame
          label="Payment failed"
          headline={<H className="text-danger">Payment failed</H>}
          body="The provider declined it, so your hold ended and the pair went back. You were not charged."
          actions={state.soldOut ? primary("join", "Join the line") : primary("buy", "Try again")}
        />
      );
    case "late-payment":
      return (
        <Frame
          label="Payment refunded"
          headline={<H className="text-danger">Payment too late — refunded</H>}
          body="Your payment arrived after the hold ended. You were not charged."
          actions={state.soldOut ? primary("join", "Join the line") : primary("buy", "Buy")}
        />
      );
  }
}
