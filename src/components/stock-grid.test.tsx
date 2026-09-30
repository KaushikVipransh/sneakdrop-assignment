// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StockGrid, squareStates } from "./stock-grid";

describe("squareStates", () => {
  it("orders sold, then held, then available, like a progress bar", () => {
    expect(
      squareStates({ total: 6, sold: 2, held: 2, available: 2, mineHeld: false, mineSold: 0 }),
    ).toEqual(["sold", "sold", "held", "held", "available", "available"]);
  });

  it("marks the user's own squares", () => {
    expect(
      squareStates({ total: 5, sold: 2, held: 2, available: 1, mineHeld: true, mineSold: 1 }),
    ).toEqual(["sold-mine", "sold", "held-mine", "held", "available"]);
  });

  it("never draws more squares than the total", () => {
    expect(
      squareStates({ total: 3, sold: 3, held: 1, available: 0, mineHeld: false, mineSold: 0 }),
    ).toHaveLength(3);
  });
});

describe("StockGrid", () => {
  afterEach(cleanup);

  it("renders one square per pair with the right counts per state", () => {
    const { container } = render(
      <StockGrid total={20} sold={13} held={3} available={4} mineHeld mineSold={1} />,
    );
    const count = (state: string) => container.querySelectorAll(`[data-state="${state}"]`).length;
    expect(container.querySelectorAll("[data-state]")).toHaveLength(20);
    expect(count("sold") + count("sold-mine")).toBe(13);
    expect(count("sold-mine")).toBe(1);
    expect(count("held") + count("held-mine")).toBe(3);
    expect(count("held-mine")).toBe(1);
    expect(count("available")).toBe(4);
  });

  it("hides the squares from screen readers and gives them a sentence instead", () => {
    const { container } = render(
      <StockGrid total={20} sold={13} held={3} available={4} mineHeld={false} mineSold={0} />,
    );
    expect(container.querySelector("[aria-hidden='true']")).not.toBeNull();
    expect(screen.getByText("13 sold, 3 held, 4 available of 20 pairs.")).toBeDefined();
  });
});
