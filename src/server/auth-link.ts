import { and, eq, sql } from "drizzle-orm";
import { db } from "./db/client";
import { holds, orders, paymentIntents, waitlistEntries } from "./db/schema";
import { releaseHold } from "./drop/holds";
import { leaveWaitlist } from "./drop/waitlist";
import { log } from "./log";

/**
 * When a guest signs in with email, their drop activity moves to the email
 * account. If the email account already has activity, nothing moves: merging
 * two histories could break the one-hold / two-pair limits. The guest user is
 * deleted after sign-in, so in that case its active hold and place in line are
 * given up, and the pair goes to the next person instead of to nobody.
 */
export async function transferGuestActivity(guestId: string, userId: string): Promise<void> {
  if (guestId === userId) return;
  const merged = await db.transaction(async (tx) => {
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
    if (existing.length > 0 || waiting.length > 0) return false;

    await tx.update(holds).set({ userId }).where(eq(holds.userId, guestId));
    await tx.update(orders).set({ userId }).where(eq(orders.userId, guestId));
    await tx.update(waitlistEntries).set({ userId }).where(eq(waitlistEntries.userId, guestId));
    await tx.update(paymentIntents).set({ userId }).where(eq(paymentIntents.userId, guestId));
    await tx.execute(sql`update audit_log set user_id = ${userId} where user_id = ${guestId}`);
    return true;
  });

  if (merged) {
    log.info("auth.linked", { guestId, userId });
    return;
  }

  log.info("auth.link_skipped", { guestId, userId });
  const activeHolds = await db
    .select({ id: holds.id })
    .from(holds)
    .where(and(eq(holds.userId, guestId), eq(holds.status, "ACTIVE")));
  for (const hold of activeHolds) await releaseHold(guestId, hold.id);
  const entries = await db
    .select({ dropId: waitlistEntries.dropId })
    .from(waitlistEntries)
    .where(and(eq(waitlistEntries.userId, guestId), eq(waitlistEntries.status, "WAITING")));
  for (const entry of entries) await leaveWaitlist(guestId, entry.dropId);
}
