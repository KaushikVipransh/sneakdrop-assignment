import { randomUUID } from "node:crypto";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { db } from "./db/client";
import { account, user } from "./db/schema";
import { log } from "./log";

/**
 * Creates (or updates) the shared admin login from ADMIN_EMAIL / ADMIN_PASSWORD.
 * Public password sign-up is disabled, so this is the only password account.
 * Changing ADMIN_PASSWORD and restarting replaces the old password.
 */
export async function ensureAdminAccount(rawEmail: string, password: string): Promise<void> {
  const email = rawEmail.trim().toLowerCase();
  const now = new Date();

  let [existing] = await db.select().from(user).where(eq(user.email, email));
  if (!existing) {
    [existing] = await db
      .insert(user)
      .values({
        id: randomUUID(),
        name: "Admin",
        email,
        emailVerified: true,
        isAnonymous: false,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
  } else if (!existing.emailVerified || existing.isAnonymous) {
    await db
      .update(user)
      .set({ emailVerified: true, isAnonymous: false, updatedAt: now })
      .where(eq(user.id, existing.id));
  }
  const userId = existing!.id;

  const [credential] = await db
    .select()
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "credential")));
  if (credential?.password && (await verifyPassword({ hash: credential.password, password }))) {
    return;
  }

  const hash = await hashPassword(password);
  if (credential) {
    await db
      .update(account)
      .set({ password: hash, updatedAt: now })
      .where(eq(account.id, credential.id));
  } else {
    await db.insert(account).values({
      id: randomUUID(),
      accountId: userId,
      providerId: "credential",
      userId,
      password: hash,
      createdAt: now,
      updatedAt: now,
    });
  }
  log.info("admin.account_ready", { email });
}
