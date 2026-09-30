// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DropStatus } from "@/lib/status";
import { STATUS_POLL_MS, useDropStatus } from "./use-drop-status";

function statusAt(serverTime: Date): DropStatus {
  return {
    serverTime: serverTime.toISOString(),
    drop: {
      id: "d",
      name: "Drop",
      total: 20,
      available: 7,
      sold: 10,
      held: 3,
      waitlistLength: 0,
      startsAt: new Date(0).toISOString(),
      holdSeconds: 300,
      maxPerUser: 2,
    },
    me: null,
  };
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useDropStatus", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("polls every 1.5 s", () => {
    expect(STATUS_POLL_MS).toBe(1500);
  });

  it("returns the status and the server clock offset", async () => {
    // The server clock is 3 minutes ahead of this client.
    const fetchMock = vi.fn(async () => Response.json(statusAt(new Date(Date.now() + 180_000))));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useDropStatus(), { wrapper });

    await waitFor(() => expect(result.current.status).toBeDefined());
    expect(result.current.status?.drop.available).toBe(7);
    expect(Math.abs(result.current.serverOffset - 180_000)).toBeLessThan(1000);
    expect(Math.abs(result.current.serverNow() - (Date.now() + 180_000))).toBeLessThan(1000);
    expect(fetchMock).toHaveBeenCalledWith("/api/drop/status", expect.anything());
  });

  it("reports an error when the server is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("network down");
      }),
    );
    const { result } = renderHook(() => useDropStatus(), { wrapper });
    await waitFor(() => expect(result.current.error).toBeTruthy());
  });
});
