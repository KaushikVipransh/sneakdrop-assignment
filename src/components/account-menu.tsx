"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { Button } from "./ui/button";

type Props = { email: string | null; isGuest: boolean };

/** Guest / email label with a small menu: sign in by email link, or sign out. */
export function AccountMenu({ email, isGuest }: Props) {
  const [address, setAddress] = useState("");
  const [sending, setSending] = useState(false);

  async function sendLink(event: FormEvent) {
    event.preventDefault();
    setSending(true);
    const { error } = await authClient.signIn.magicLink({ email: address, callbackURL: "/" });
    setSending(false);
    if (error) toast.error(error.message ?? "Couldn't send the link. Try again.");
    else toast.success("Check your inbox for the sign-in link.");
  }

  async function signOut() {
    await authClient.signOut();
    window.location.reload();
  }

  return (
    <details className="group relative">
      <summary className="flex h-10 cursor-pointer list-none items-center gap-1 rounded-full px-3 text-sm text-text-muted hover:bg-white/70 hover:text-ink [&::-webkit-details-marker]:hidden">
        <span className="max-w-[16ch] truncate">{isGuest ? "guest" : (email ?? "account")}</span>
        <span aria-hidden className="text-xs transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="glass absolute right-0 z-40 mt-3 w-[min(18rem,calc(100vw-2rem))] space-y-3 rounded-3xl p-4 text-sm shadow-xl">
        {isGuest ? (
          <form onSubmit={sendLink} className="space-y-3">
            <p className="text-text-muted">
              You&apos;re shopping as a guest. Add your email to keep your pairs on any device.
            </p>
            <label className="block">
              <span className="label">Email</span>
              <input
                type="email"
                required
                autoComplete="email"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="mt-1 h-11 w-full rounded-full border border-border bg-white px-4 text-text"
              />
            </label>
            <Button
              type="submit"
              size="sm"
              variant="secondary"
              loading={sending}
              className="w-full"
            >
              Email me a sign-in link
            </Button>
          </form>
        ) : (
          <p className="truncate text-text-muted">Signed in as {email}</p>
        )}
        <Button size="sm" variant="ghost" onClick={signOut} className="w-full">
          Sign out
        </Button>
      </div>
    </details>
  );
}
