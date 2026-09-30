"use client";

import { useEffect, useRef } from "react";
import { authClient } from "@/lib/auth-client";

/** Signs the visitor in as a guest on first visit, so Buy works with one click. */
export function EnsureGuestSession() {
  const { data, isPending } = authClient.useSession();
  const started = useRef(false);

  useEffect(() => {
    if (isPending || data || started.current) return;
    started.current = true;
    void authClient.signIn.anonymous();
  }, [data, isPending]);

  return null;
}
