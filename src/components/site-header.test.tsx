// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SiteHeader } from "./site-header";
import { StatsStrip } from "./stats-strip";

describe("SiteHeader", () => {
  afterEach(cleanup);

  it("shows LIVE with a pulsing orange dot", () => {
    const { container } = render(<SiteHeader phase="live" startsAt={new Date()} />);
    expect(screen.getByText("SNEAKER DROP")).toBeDefined();
    expect(screen.getByTestId("phase").textContent).toBe("LIVE");
    expect(container.querySelector("[data-phase='live']")?.className).toContain("bg-accent");
  });

  it("shows the opening time before the sale and ENDED after", () => {
    render(<SiteHeader phase="pre-sale" startsAt={new Date("2026-10-15T10:00:00")} />);
    expect(screen.getByTestId("phase").textContent).toMatch(/^OPENS 10:00/);
    cleanup();
    render(<SiteHeader phase="ended" startsAt={new Date()} />);
    expect(screen.getByTestId("phase").textContent).toBe("ENDED");
  });
});

describe("StatsStrip", () => {
  afterEach(cleanup);

  it("renders sold, held, and waiting", () => {
    render(<StatsStrip sold={13} held={3} waiting={142} />);
    const terms = screen.getAllByRole("term").map((t) => t.textContent);
    const values = screen.getAllByRole("definition").map((d) => d.textContent);
    expect(terms).toEqual(["Sold", "Held", "Waiting"]);
    expect(values).toEqual(["13", "3", "142"]);
  });
});
