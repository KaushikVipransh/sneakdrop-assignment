import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { user } from "@/server/db/schema";
import { guestCookie } from "@/test/auth";
import { resetDb } from "@/test/db";
import { isAdminEmail, requireAdmin } from "./require-admin";

const req = (cookie?: string) =>
  new Request("http://localhost/api/admin/state", { headers: cookie ? { cookie } : {} });

describe("isAdminEmail", () => {
  it("matches the comma-separated list, case-insensitively", () => {
    expect(isAdminEmail("Ops@Example.com", "ops@example.com, boss@example.com")).toBe(true);
    expect(isAdminEmail("boss@example.com", "ops@example.com,boss@example.com")).toBe(true);
    expect(isAdminEmail("someone@example.com", "ops@example.com")).toBe(false);
    expect(isAdminEmail("ops@example.com", "")).toBe(false);
  });
});

describe("requireAdmin", () => {
  beforeEach(resetDb);
  afterAll(resetDb);

  it("401 without a session", async () => {
    const result = await requireAdmin(req());
    expect(result.ok ? 200 : result.response.status).toBe(401);
  });

  it("403 for a guest or a non-admin email", async () => {
    const { cookie } = await guestCookie();
    const result = await requireAdmin(req(cookie));
    expect(result.ok ? 200 : result.response.status).toBe(403);
  });

  it("allows an email listed in ADMIN_EMAILS", async () => {
    const { cookie, userId } = await guestCookie();
    // Turn the guest into the admin account, as the magic link would.
    await db
      .update(user)
      .set({ email: process.env.ADMIN_EMAILS!.split(",")[0]!, isAnonymous: false });
    // Send only the session token so the 60 s cookie cache (still the guest) is bypassed.
    const token = cookie.split("; ").filter((c) => c.includes("session_token")).join("; ");
    const result = await requireAdmin(req(token));
    expect(result).toMatchObject({ ok: true, user: { id: userId } });
  });
});
