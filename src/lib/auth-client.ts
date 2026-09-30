"use client";

import { anonymousClient, magicLinkClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  plugins: [anonymousClient(), magicLinkClient()],
});

let guestSignIn: Promise<void> | null = null;

/**
 * Makes sure the browser has a session, creating a guest if needed. Concurrent
 * callers share one sign-in: two parallel guest sign-ins would create two users,
 * and the page could end up showing the one without the hold.
 */
export function ensureGuest(): Promise<void> {
  guestSignIn ??= (async () => {
    const { data } = await authClient.getSession();
    if (!data) await authClient.signIn.anonymous();
  })().finally(() => {
    guestSignIn = null;
  });
  return guestSignIn;
}
