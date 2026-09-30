"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { CardAction } from "@/components/main-card";
import { ensureGuest } from "@/lib/auth-client";
import { STATUS_QUERY_KEY } from "./use-drop-status";

function request(action: CardAction, holdId?: string): { url: string; method: string } {
  switch (action) {
    case "buy":
      return { url: "/api/drop/hold", method: "POST" };
    case "join":
      return { url: "/api/drop/waitlist", method: "POST" };
    case "leave":
      return { url: "/api/drop/waitlist", method: "DELETE" };
    case "pay":
      return { url: `/api/holds/${holdId}/pay`, method: "POST" };
    case "release":
      return { url: `/api/holds/${holdId}/release`, method: "POST" };
  }
}

/** Codes that are an answer, not an error: the next status poll shows the result. */
const QUIET_CODES = new Set(["ALREADY_HOLDING", "ALREADY_PENDING", "ALREADY_WAITING"]);

/**
 * Runs one card action at a time. The button shows a spinner while the request
 * is in flight; errors become a toast; success refetches status immediately.
 */
export function useDropActions() {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<CardAction | null>(null);

  const run = useCallback(
    async (action: CardAction, holdId?: string) => {
      if (pending) return;
      setPending(action);
      try {
        const { url, method } = request(action, holdId);
        let response = await fetch(url, { method });
        if (response.status === 401) {
          // The click beat the guest sign-in on first visit: sign in, then retry once.
          await ensureGuest();
          response = await fetch(url, { method });
        }
        const body = (await response.json().catch(() => ({}))) as {
          code?: string;
          message?: string;
        };
        if (!response.ok) {
          toast.error(body.message ?? "Something went wrong. Please try again.");
        } else if (body.code && !QUIET_CODES.has(body.code) && action === "join") {
          toast.success(body.message ?? "You're in line.");
        }
      } catch {
        toast.error("Couldn't reach the server — retrying.");
      } finally {
        await queryClient.invalidateQueries({ queryKey: STATUS_QUERY_KEY });
        setPending(null);
      }
    },
    [pending, queryClient],
  );

  return { pending, run };
}
