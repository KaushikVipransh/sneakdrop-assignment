import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { auth } from "@/server/auth";
import { db } from "@/server/db/client";
import { account, user } from "@/server/db/schema";
import { requireAdmin } from "@/server/http/require-admin";
import { resetDb } from "@/test/db";
import { ensureAdminAccount } from "./admin-account";

const EMAIL = "Admin@Sneakdrop.app";
const PASSWORD = "correct-horse-battery-1";

const signIn = (email: string, password: string) =>
  auth.api.signInEmail({ body: { email, password }, returnHeaders: true, asResponse: true });

describe("ensureAdminAccount", () => {
  beforeEach(resetDb);
  afterAll(resetDb);

  it("creates one verified admin user with a password, idempotently", async () => {
    await ensureAdminAccount(EMAIL, PASSWORD);
    await ensureAdminAccount(EMAIL, PASSWORD);
    const users = await db.select().from(user);
    expect(users).toMatchObject([
      { email: "admin@sneakdrop.app", emailVerified: true, isAnonymous: false },
    ]);
    const accounts = await db.select().from(account).where(eq(account.userId, users[0]!.id));
    expect(accounts).toMatchObject([{ providerId: "credential" }]);
    expect(accounts[0]!.password).not.toContain(PASSWORD);
  });

  it("signs in with the right password only", async () => {
    await ensureAdminAccount(EMAIL, PASSWORD);
    expect((await signIn("admin@sneakdrop.app", PASSWORD)).status).toBe(200);
    expect((await signIn("admin@sneakdrop.app", "wrong-password-123")).status).toBe(401);
  });

  it("changing ADMIN_PASSWORD replaces the old password", async () => {
    await ensureAdminAccount(EMAIL, PASSWORD);
    await ensureAdminAccount(EMAIL, "a-brand-new-password-9");
    expect((await signIn("admin@sneakdrop.app", PASSWORD)).status).toBe(401);
    expect((await signIn("admin@sneakdrop.app", "a-brand-new-password-9")).status).toBe(200);
  });

  it("the signed-in admin passes the admin guard", async () => {
    await ensureAdminAccount(process.env.ADMIN_EMAIL!, PASSWORD);
    const response = await signIn(process.env.ADMIN_EMAIL!, PASSWORD);
    const cookie = response.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    const result = await requireAdmin(
      new Request("http://localhost/api/admin/state", { headers: { cookie } }),
    );
    expect(result.ok).toBe(true);
  });

  it("nobody can sign up with a password", async () => {
    const response = await auth.api.signUpEmail({
      body: { email: "intruder@example.com", password: "intruder-password-1", name: "x" },
      asResponse: true,
    });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(await db.select().from(user)).toHaveLength(0);
  });
});
