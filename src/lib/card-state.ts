import type { DropStatus, StatusHold } from "./status";

/** The main card's 12 states (DESIGN.md §3.3). */
export const CARD_STATES = [
  "pre-sale",
  "available",
  "holding",
  "last-minute",
  "paying",
  "purchased",
  "limit-reached",
  "sold-out",
  "in-line",
  "promoted",
  "expired",
  "late-payment",
] as const;

export type CardKind = (typeof CARD_STATES)[number];

export type CardState =
  | { kind: "pre-sale"; startsAt: string }
  | { kind: "available" }
  | { kind: "holding" | "last-minute" | "promoted"; hold: StatusHold }
  | { kind: "paying"; hold: StatusHold }
  | {
      kind: "purchased";
      orderRef: string;
      purchased: number;
      limit: number;
      canBuyAnother: boolean;
      soldOut: boolean;
    }
  | { kind: "limit-reached"; limit: number }
  | { kind: "sold-out" }
  | { kind: "in-line"; position: number }
  | { kind: "expired"; soldOut: boolean }
  | { kind: "late-payment"; soldOut: boolean };

const LAST_MINUTE_MS = 60_000;

/** Short human order reference, e.g. "A1F3". */
export function orderRef(orderId: string): string {
  return orderId.replaceAll("-", "").slice(0, 4).toUpperCase();
}

/**
 * Pure mapping from server status (and the server-corrected clock) to the one
 * card state to show. Precedence matters: an active hold beats everything, and
 * a place in line beats the story of an older hold.
 */
export function deriveCardState(status: DropStatus, now: number): CardState {
  const { drop, me } = status;
  const soldOut = drop.available <= 0;

  if (now < Date.parse(drop.startsAt)) return { kind: "pre-sale", startsAt: drop.startsAt };
  if (!me) return soldOut ? { kind: "sold-out" } : { kind: "available" };

  if (me.hold) {
    const hold = me.hold;
    if (me.payment?.status === "PENDING" && me.latestHold?.id === hold.id) {
      return { kind: "paying", hold };
    }
    if (Date.parse(hold.expiresAt) - now < LAST_MINUTE_MS) return { kind: "last-minute", hold };
    if (hold.source === "waitlist") return { kind: "promoted", hold };
    return { kind: "holding", hold };
  }

  if (me.purchased >= me.limit) return { kind: "limit-reached", limit: me.limit };
  if (me.waitlistPosition !== null) return { kind: "in-line", position: me.waitlistPosition };

  const latest = me.latestHold;
  if (latest && me.payment?.status === "REFUNDED") return { kind: "late-payment", soldOut };
  if (latest?.status === "CONVERTED") {
    const lastOrder = me.orders.at(-1);
    return {
      kind: "purchased",
      orderRef: lastOrder ? orderRef(lastOrder.id) : "",
      purchased: me.purchased,
      limit: me.limit,
      canBuyAnother: !soldOut,
      soldOut,
    };
  }
  if (latest?.status === "EXPIRED") return { kind: "expired", soldOut };

  return soldOut ? { kind: "sold-out" } : { kind: "available" };
}
