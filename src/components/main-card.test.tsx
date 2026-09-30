// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CardState } from "@/lib/card-state";
import type { StatusHold } from "@/lib/status";
import { MainCard } from "./main-card";

const now = Date.now();
const hold: StatusHold = {
  id: "h1",
  status: "ACTIVE",
  source: "buy",
  createdAt: new Date(now).toISOString(),
  expiresAt: new Date(now + 252_000).toISOString(),
  endedAt: null,
};

const states: [CardState, RegExp, string[]][] = [
  [{ kind: "pre-sale", startsAt: new Date(now + 60_000).toISOString() }, /Opens in/, ["Buy"]],
  [{ kind: "available" }, /Get a pair/, ["Buy"]],
  [{ kind: "holding", hold }, /Pay before it runs out/, ["Pay now", "Release"]],
  [{ kind: "last-minute", hold }, /Less than a minute left/, ["Pay now", "Release"]],
  [{ kind: "paying", hold }, /Processing/, []],
  [
    {
      kind: "purchased",
      orderRef: "A1F3",
      purchased: 1,
      limit: 2,
      canBuyAnother: true,
      soldOut: false,
    },
    /It's yours\./,
    ["Buy another"],
  ],
  [{ kind: "limit-reached", limit: 2 }, /That's your two/, []],
  [{ kind: "sold-out" }, /Sold out — for now/, ["Join the line"]],
  [{ kind: "in-line", position: 23 }, /#23/, ["Leave line"]],
  [
    { kind: "promoted", hold: { ...hold, source: "waitlist" } },
    /Your turn/,
    ["Pay now", "Release"],
  ],
  [{ kind: "expired", soldOut: true }, /Time's up/, ["Join the line"]],
  [{ kind: "late-payment", soldOut: false }, /Payment too late — refunded/, ["Buy"]],
  [{ kind: "payment-failed", soldOut: false }, /declined it/, ["Try again"]],
];

describe("MainCard", () => {
  afterEach(cleanup);

  for (const [state, headline, buttons] of states) {
    it(`renders ${state.kind}`, () => {
      render(
        <MainCard state={state} serverNow={() => Date.now()} pending={null} onAction={() => {}} />,
      );
      expect(screen.getAllByText(headline).length).toBeGreaterThan(0);
      expect(screen.queryAllByRole("button").map((b) => b.textContent)).toEqual(buttons);
    });
  }

  it("passes the hold id with Pay and disables every button while one action is pending", () => {
    const onAction = vi.fn();
    const { rerender } = render(
      <MainCard
        state={{ kind: "holding", hold }}
        serverNow={() => Date.now()}
        pending={null}
        onAction={onAction}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Pay now" }));
    expect(onAction).toHaveBeenCalledWith("pay", "h1");

    rerender(
      <MainCard
        state={{ kind: "holding", hold }}
        serverNow={() => Date.now()}
        pending="pay"
        onAction={onAction}
      />,
    );
    for (const b of screen.getAllByRole("button")) expect(b).toHaveProperty("disabled", true);
  });
});
