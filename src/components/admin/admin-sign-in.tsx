"use client";

import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "../ui/button";
import { Card } from "../ui/card";

const inputClass = "mt-1 h-11 w-full rounded-full border border-border bg-white px-4 text-text";

/** Shown instead of the console to anyone who is not an admin. */
export function AdminSignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<
    "idle" | "signing-in" | "bad-login" | "sending" | "sent" | "send-error"
  >("idle");

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setState("signing-in");
    const { error } = await authClient.signIn.email({ email, password });
    if (error) {
      setState("bad-login");
      return;
    }
    window.location.reload();
  }

  async function sendLink() {
    if (!email) return;
    setState("sending");
    const { error } = await authClient.signIn.magicLink({ email, callbackURL: "/admin" });
    setState(error ? "send-error" : "sent");
  }

  const message = {
    idle: null,
    "signing-in": null,
    "bad-login": "Wrong email or password.",
    sending: null,
    sent: "Link sent. Check your inbox (or the server logs).",
    "send-error": "Couldn't send the link. Try again.",
  }[state];

  return (
    <main className="mx-auto w-full max-w-[480px] px-4 py-16">
      <Card className="space-y-5">
        <p className="label">Sneaker Drop / Admin</p>
        <h1 className="text-2xl font-semibold text-ink">Admins only</h1>
        <form onSubmit={signIn} className="space-y-3">
          <label className="block">
            <span className="label">Email</span>
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="label">Password</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
          </label>
          <Button type="submit" className="w-full" loading={state === "signing-in"}>
            Sign in
          </Button>
        </form>
        <p className="text-sm text-text-muted">
          No password?{" "}
          <button
            type="button"
            onClick={sendLink}
            disabled={!email || state === "sending"}
            className="min-h-11 text-ink underline underline-offset-4 disabled:opacity-50"
          >
            Email me a sign-in link
          </button>{" "}
          instead (works for emails in <code className="num">ADMIN_EMAILS</code>).
        </p>
        <p role="status" className="min-h-5 text-sm text-text-muted">
          {message}
        </p>
      </Card>
    </main>
  );
}
