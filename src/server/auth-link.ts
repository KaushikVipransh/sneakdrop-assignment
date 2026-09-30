import { eq, sql } from "drizzle-orm";
import { db } from "./db/client";
import { holds, orders, paymentIntents, waitlistEntries } from "./db/schema";
import { log } from "./log";

/**
 * When a guest signs in with email, their drop activity moves to the email
 * account. If the email account already has activity, nothing moves: merging
 * two histories could break the one-hold / two-pair limits.
 */
export async function transferGuestActivity(guestId: string, userId: string): Promise<void> {
  if (guestId === userId) return;
  await db.transaction(async (tx) => {
    // Serialise with drop mutations for this user's drops.
    await tx.execute(sql`select id from drops order by id for update`);
    const existing = await tx
      .select({ id: holds.id })
      .from(holds)
      .where(eq(holds.userId, userId))
      .limit(1);
    const waiting = await tx
      .select({ id: waitlistEntries.id })
      .from(waitlistEntries)
      .where(eq(waitlistEntries.userId, userId))
      .limit(1);
    if (existing.length > 0 || waiting.length > 0) {
      log.info("auth.link_skipped", { guestId, userId });
      return;
    }
    await tx.update(holds).set({ userId }).where(eq(holds.userId, guestId));
    await tx.update(orders).set({ userId }).where(eq(orders.userId, guestId));
    await tx.update(waitlistEntries).set({ userId }).where(eq(waitlistEntries.userId, guestId));
    await tx.update(paymentIntents).set({ userId }).where(eq(paymentIntents.userId, guestId));
    await tx.execute(sql`update audit_log set user_id = ${userId} where user_id = ${guestId}`);
    log.info("auth.linked", { guestId, userId });
  });
}
