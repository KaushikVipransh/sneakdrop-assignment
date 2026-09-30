"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { dropStatusSchema, type DropStatus } from "@/lib/status";

export const STATUS_POLL_MS = 1500;
export const STATUS_QUERY_KEY = ["drop-status"] as const;

type Fetched = { status: DropStatus; serverOffset: number };

async function fetchStatus(): Promise<Fetched> {
  const sentAt = Date.now();
  const response = await fetch("/api/drop/status", { cache: "no-store" });
  const receivedAt = Date.now();
  if (!response.ok) throw new Error(`Status request failed (${response.status})`);
  const status = dropStatusSchema.parse(await response.json());
  // Assume the server read its clock halfway through the round trip.
  const serverOffset = Date.parse(status.serverTime) - (sentAt + receivedAt) / 2;
  return { status, serverOffset };
}

/**
 * Live drop status, polled every 1.5 s. Countdowns use `serverNow()`, which
 * corrects the client clock by the measured offset, so a wrong local clock
 * does not change how long a hold appears to last.
 */
export function useDropStatus() {
  const query = useQuery({
    queryKey: STATUS_QUERY_KEY,
    queryFn: fetchStatus,
    refetchInterval: STATUS_POLL_MS,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  });
  const serverOffset = query.data?.serverOffset ?? 0;
  const serverNow = useCallback(() => Date.now() + serverOffset, [serverOffset]);

  return {
    status: query.data?.status,
    serverOffset,
    serverNow,
    error: query.error,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
