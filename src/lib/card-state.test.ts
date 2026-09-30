import { describe, expect, it } from "vitest";
import { deriveCardState, CARD_STATES } from "./card-state";
import type { DropStatus, StatusHold } from "./status";

const NOW = Date.parse("2026-10-15T10:00:00Z");
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

function hold(overrides: Partial<StatusHold> = {}): StatusHold {
  return {
    id: "h1",
    status: "ACTIVE",
    source: "buy",
    createdAt: iso(-60_000),
    expiresAt: iso(240_000),
    endedAt: null,
    ...overrides,
  };
}

type Me = NonNullable<DropStatus["me"]>;

function status(me: Partial<Me> | null, drop: Partial<DropStatus["drop"]> = {}): DropStatus {
  return {
    serverTime: iso(0),
    drop: {
      id: "d",
      name: "Drop",
      total: 20,
      available: 5,
      sold: 10,
      held: 5,
      waitlistLength: 0,
      startsAt: iso(-3_600_000),
      holdSeconds: 300,
      maxPerUser: 2,
      ...drop,
    },
    me:
      me === null
        ? null
        : {
            userId: "u",
            email: null,
            isGuest: true,
            hold: null,
            latestHold: null,
            payment: null,
            waitlistPosition: null,
            purchased: 0,
            limit: 2,
            orders: [],
            events: [],
            ...me,
          },
  };
}

describe("deriveCardState", () => {
  const cases: [string, DropStatus][] = [
    [
      "payment-failed",
      status({
        latestHold: hold({ status: "RELEASED", endedAt: iso(-1000) }),
        payment: { id: "p", status: "FAILED" },
      }),
    ],
    ["pre-sale", status({}, { startsAt: iso(60_000) })],
    ["available", status({})],
    ["holding", status({ hold: hold(), latestHold: hold() })],
    [
      "last-minute",
      status({
        hold: hold({ expiresAt: iso(42_000) }),
        latestHold: hold({ expiresAt: iso(42_000) }),
      }),
    ],
    [
      "paying",
      status({ hold: hold(), latestHold: hold(), payment: { id: "p", status: "PENDING" } }),
    ],
    [
      "purchased",
      status({
        latestHold: hold({ status: "CONVERTED", endedAt: iso(-1000) }),
        payment: { id: "p", status: "SUCCEEDED" },
        purchased: 1,
        orders: [{ id: "a1f3c0de-0000-0000-0000-000000000000", createdAt: iso(-1000) }],
      }),
    ],
    ["limit-reached", status({ latestHold: hold({ status: "CONVERTED" }), purchased: 2 })],
    ["sold-out", status({}, { available: 0, held: 10 })],
    ["in-line", status({ waitlistPosition: 23 }, { available: 0, waitlistLength: 40 })],
    [
      "promoted",
      status({ hold: hold({ source: "waitlist" }), latestHold: hold({ source: "waitlist" }) }),
    ],
    [
      "expired",
      status({
        latestHold: hold({ status: "EXPIRED", expiresAt: iso(-1000), endedAt: iso(-1000) }),
      }),
    ],
    [
      "late-payment",
      status({
        latestHold: hold({ status: "EXPIRED", endedAt: iso(-1000) }),
        payment: { id: "p", status: "REFUNDED" },
      }),
    ],
  ];

  it("says so when the payment failed and the pair went back", () => {
    const s = status(
      {
        latestHold: hold({ status: "RELEASED", endedAt: iso(-1000) }),
        payment: { id: "p", status: "FAILED" },
      },
      { available: 0 },
    );
    expect(deriveCardState(s, NOW)).toEqual({ kind: "payment-failed", soldOut: true });
  });

  it("covers all 13 states", () => {
    expect(new Set(cases.map(([kind]) => kind))).toEqual(new Set(CARD_STATES));
    expect(CARD_STATES).toHaveLength(13);
  });

  for (const [kind, s] of cases) {
    it(`derives ${kind}`, () => {
      expect(deriveCardState(s, NOW).kind).toBe(kind);
    });
  }

  it("holding shows the local expiry time and the hold to pay", () => {
    const state = deriveCardState(status({ hold: hold(), latestHold: hold() }), NOW);
    expect(state).toMatchObject({ kind: "holding", hold: { id: "h1" } });
  });

  it("purchased offers another pair only if under the limit and stock is left", () => {
    const base = {
      latestHold: hold({ status: "CONVERTED" as const }),
      purchased: 1,
      orders: [{ id: "a1f3c0de-0000", createdAt: iso(0) }],
    };
    expect(deriveCardState(status(base), NOW)).toMatchObject({
      kind: "purchased",
      canBuyAnother: true,
      orderRef: "A1F3",
    });
    expect(deriveCardState(status(base, { available: 0 }), NOW)).toMatchObject({
      canBuyAnother: false,
    });
  });

  it("waiting in line wins over an older expired hold", () => {
    const s = status({
      latestHold: hold({ status: "EXPIRED" }),
      waitlistPosition: 3,
    });
    expect(deriveCardState(s, NOW)).toMatchObject({ kind: "in-line", position: 3 });
  });

  it("with no session yet it shows the public state", () => {
    expect(deriveCardState(status(null), NOW).kind).toBe("available");
    expect(deriveCardState(status(null, { available: 0 }), NOW).kind).toBe("sold-out");
  });
});
