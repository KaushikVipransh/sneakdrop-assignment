// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StockOrbit, orbitSlots } from "./stock-orbit";

describe("orbitSlots", () => {
  it("places every pair inside the box, 12 outer and 8 inner for 20", () => {
    const slots = orbitSlots(20);
    expect(slots).toHaveLength(20);
    expect(slots.filter((s) => s.ring === "outer")).toHaveLength(12);
    for (const s of slots) {
      expect(s.x).toBeGreaterThan(0);
      expect(s.x).toBeLessThan(100);
      expect(s.y).toBeGreaterThan(0);
      expect(s.y).toBeLessThan(100);
    }
  });
});

describe("StockOrbit", () => {
  afterEach(cleanup);

  it("renders one tile per pair with the right state counts", () => {
    const { container } = render(
      <StockOrbit
        total={20}
        sold={13}
        held={3}
        available={4}
        mineHeld
        mineSold={1}
        chip="You · 04:12"
      />,
    );
    const count = (s: string) => container.querySelectorAll(`[data-state="${s}"]`).length;
    expect(container.querySelectorAll("[data-state]")).toHaveLength(20);
    expect(count("sold") + count("sold-mine")).toBe(13);
    expect(count("held-mine")).toBe(1);
    expect(count("available")).toBe(4);
    expect(screen.getByText("You · 04:12")).toBeDefined();
  });

  it("shows pairs left and a screen-reader sentence", () => {
    render(
      <StockOrbit total={20} sold={13} held={3} available={4} mineHeld={false} mineSold={0} />,
    );
    expect(screen.getByText("04")).toBeDefined();
    expect(screen.getByText("13 sold, 3 held, 4 available of 20 pairs.")).toBeDefined();
  });
});
