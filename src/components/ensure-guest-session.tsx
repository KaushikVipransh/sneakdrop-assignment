"use client";

import { useEffect } from "react";
import { ensureGuest } from "@/lib/auth-client";

/** Signs the visitor in as a guest on first visit, so Buy works with one click. */
export function EnsureGuestSession() {
  useEffect(() => {
    void ensureGuest();
  }, []);
  return null;
}
