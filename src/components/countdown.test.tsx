// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Countdown, formatRemaining } from "./countdown";

describe("formatRemaining", () => {
  it("formats mm:ss and clamps at zero", () => {
    expect(formatRemaining(300_000)).toBe("05:00");
    expect(formatRemaining(252_400)).toBe("04:13");
    expect(formatRemaining(999)).toBe("00:01");
    expect(formatRemaining(0)).toBe("00:00");
    expect(formatRemaining(-5000)).toBe("00:00");
  });
});

describe("Countdown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-15T10:00:00Z"));
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("counts down from the server expiry and warns under a minute", () => {
    const onExpire = vi.fn();
    const expiresAt = new Date(Date.now() + 65_000).toISOString();
    render(<Countdown expiresAt={expiresAt} serverNow={() => Date.now()} onExpire={onExpire} />);

    const clock = screen.getByTestId("countdown");
    expect(clock.textContent).toBe("01:05");
    expect(clock.className).not.toContain("text-danger");

    act(() => vi.advanceTimersByTime(6_000));
    expect(clock.textContent).toBe("00:59");
    expect(clock.className).toContain("text-danger");

    act(() => vi.advanceTimersByTime(60_000));
    expect(clock.textContent).toBe("00:00");
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("uses the server clock, not the local one", () => {
    // Local clock is 3 minutes behind the server.
    const serverNow = () => Date.now() + 180_000;
    const expiresAt = new Date(Date.now() + 180_000 + 120_000).toISOString();
    render(<Countdown expiresAt={expiresAt} serverNow={serverNow} />);
    expect(screen.getByTestId("countdown").textContent).toBe("02:00");
  });

  it("announces to screen readers at most every 30 s", () => {
    const expiresAt = new Date(Date.now() + 125_000).toISOString();
    render(<Countdown expiresAt={expiresAt} serverNow={() => Date.now()} />);
    const live = screen.getByRole("status");
    expect(live.textContent).toBe("2 minutes 5 seconds left on your hold");

    act(() => vi.advanceTimersByTime(10_000));
    expect(live.textContent).toBe("2 minutes 5 seconds left on your hold");

    act(() => vi.advanceTimersByTime(21_000));
    expect(live.textContent).toBe("1 minute 35 seconds left on your hold");
  });
});
