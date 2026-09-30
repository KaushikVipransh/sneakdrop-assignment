"use client";

import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "../ui/button";
import { Card } from "../ui/card";

/** Shown instead of the console to anyone who is not an admin. */
export function AdminSignIn() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setState("sending");
    const { error } = await authClient.signIn.magicLink({ email, callbackURL: "/admin" });
    setState(error ? "error" : "sent");
  }

  return (
    <main className="mx-auto w-full max-w-[480px] px-4 py-16">
      <Card className="space-y-4">
        <p className="label">Sneaker Drop / Admin</p>
        <h1 className="text-2xl font-semibold">Admins only</h1>
        <p className="text-text-muted">
          Sign in with an email listed in <code className="num">ADMIN_EMAILS</code>. Locally, the
          link is printed in the server console.
        </p>
        <form onSubmit={submit} className="space-y-3">
          <label className="block">
            <span className="label">Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 h-11 w-full rounded-[var(--radius-control)] border border-border bg-surface-muted px-3"
            />
          </label>
          <Button type="submit" variant="secondary" loading={state === "sending"}>
            Email me a sign-in link
          </Button>
        </form>
        <p role="status" className="text-sm text-text-muted">
          {state === "sent" ? "Link sent. Check your inbox (or the server console)." : null}
          {state === "error" ? "Couldn't send the link. Try again." : null}
        </p>
      </Card>
    </main>
  );
}
