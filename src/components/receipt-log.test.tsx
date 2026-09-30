// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ReceiptEvent } from "@/lib/status";
import { ReceiptLog, receiptLines } from "./receipt-log";

const at = (s: number) => new Date(Date.UTC(2026, 9, 15, 10, 0, s)).toISOString();
const ev = (s: number, entity: string, from: string | null, to: string): ReceiptEvent => ({
  at: at(s),
  entity,
  from,
  to,
});

describe("receiptLines", () => {
  it("tells the payment story in order", () => {
    const lines = receiptLines([
      ev(3, "hold", null, "ACTIVE"),
      ev(51, "payment", null, "PENDING"),
      ev(52, "payment", "PENDING", "SUCCEEDED"),
      ev(52, "hold", "ACTIVE", "CONVERTED"),
      ev(52, "order", null, "CREATED"),
    ]).map((l) => l.text);
    expect(lines).toEqual([
      "Hold created",
      "Payment started · processing…",
      "Payment succeeded",
      "Purchase confirmed",
    ]);
  });

  it("shows a promotion once, not as promotion plus a new hold", () => {
    const lines = receiptLines([
      ev(1, "waitlist", null, "WAITING"),
      ev(9, "waitlist", "WAITING", "PROMOTED"),
      ev(9, "hold", null, "ACTIVE"),
    ]).map((l) => l.text);
    expect(lines).toEqual(["Joined the line", "Your turn — promoted from the line"]);
  });

  it("explains expiry and a late refund", () => {
    const lines = receiptLines([
      ev(0, "hold", "ACTIVE", "EXPIRED"),
      ev(1, "payment", "PENDING", "REFUNDED"),
    ]).map((l) => l.text);
    expect(lines).toEqual(["Hold expired", "Payment arrived too late — refunded"]);
  });
});

describe("ReceiptLog", () => {
  afterEach(cleanup);

  it("shows the last 8 lines and reveals the rest on demand", () => {
    const events = Array.from({ length: 10 }, (_, i) =>
      ev(i, "waitlist", i % 2 ? "WAITING" : null, i % 2 ? "LEFT" : "WAITING"),
    );
    render(<ReceiptLog events={events} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(8);
    fireEvent.click(screen.getByRole("button", { name: "Show all (10)" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(10);
  });

  it("renders nothing without events", () => {
    const { container } = render(<ReceiptLog events={[]} />);
    expect(container.innerHTML).toBe("");
  });
});
