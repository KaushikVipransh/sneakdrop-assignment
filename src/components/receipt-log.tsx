"use client";

import { useState } from "react";
import type { ReceiptEvent } from "@/lib/status";
import { cn } from "@/lib/utils";

const VISIBLE = 8;

/** Turns an audit transition into a receipt line, or null to hide it. */
export function receiptMessage(e: ReceiptEvent): string | null {
  const key = `${e.entity}:${e.from ?? ""}>${e.to}`;
  switch (key) {
    case "hold:>ACTIVE":
      return "Hold created";
    case "hold:ACTIVE>EXPIRED":
      return "Hold expired";
    case "hold:ACTIVE>RELEASED":
      return "Hold released";
    case "hold:ACTIVE>CONVERTED":
      return "Purchase confirmed";
    case "waitlist:>WAITING":
      return "Joined the line";
    case "waitlist:WAITING>LEFT":
      return "Left the line";
    case "waitlist:WAITING>PROMOTED":
      return "Your turn — promoted from the line";
    case "waitlist:WAITING>SKIPPED":
      return "Skipped in line (limit reached)";
    case "payment:>PENDING":
      return "Payment started · processing…";
    case "payment:PENDING>SUCCEEDED":
      return "Payment succeeded";
    case "payment:PENDING>FAILED":
      return "Payment failed";
    case "payment:PENDING>REFUNDED":
    case "payment:FAILED>REFUNDED":
      return "Payment arrived too late — refunded";
    default:
      return null;
  }
}

/** Collapses the hold that a promotion creates into the promotion line itself. */
export function receiptLines(events: ReceiptEvent[]): { at: string; text: string }[] {
  const lines: { at: string; text: string }[] = [];
  events.forEach((e, i) => {
    const prev = events[i - 1];
    if (e.entity === "hold" && e.to === "ACTIVE" && prev?.to === "PROMOTED" && prev.at === e.at) {
      return;
    }
    const text = receiptMessage(e);
    if (text) lines.push({ at: e.at, text });
  });
  return lines;
}

const hhmmss = (iso: string) =>
  new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

/** Receipt-style log of the user's own events, newest at the bottom (DESIGN.md §3.5). */
export function ReceiptLog({ events }: { events: ReceiptEvent[] }) {
  const [showAll, setShowAll] = useState(false);
  const lines = receiptLines(events);
  if (lines.length === 0) return null;
  const hidden = Math.max(0, lines.length - VISIBLE);
  const shown = showAll ? lines : lines.slice(-VISIBLE);

  return (
    <section aria-labelledby="receipt-title" className="receipt-edge pt-6">
      <h2 id="receipt-title" className="label mb-3 text-center">
        receipt
      </h2>
      {hidden > 0 && !showAll ? (
        <button
          type="button"
          className="mb-2 min-h-11 text-[13px] text-text-muted underline underline-offset-4"
          onClick={() => setShowAll(true)}
        >
          Show all ({lines.length})
        </button>
      ) : null}
      <ol className="num space-y-0.5 text-[13px] leading-[1.6]">
        {shown.map((line, i) => (
          <li
            key={`${line.at}-${i}`}
            className={cn("flex gap-4", i === shown.length - 1 ? "text-text" : "text-text-muted")}
          >
            <time dateTime={line.at}>{hhmmss(line.at)}</time>
            <span>{line.text}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
