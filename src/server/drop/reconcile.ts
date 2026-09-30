import { and, asc, count, eq, lte } from "drizzle-orm";
import type { Tx } from "../db/client";
import {
  holds,
  orders,
  waitlistEntries,
  type Drop,
  type Hold,
  type WaitlistEntry,
} from "../db/schema";
import { audit } from "./audit";
import { getCounts } from "./counts";

export type PromotionResult = {
  promoted: Hold[];
  skipped: WaitlistEntry[];
};

export type ReconcileResult = PromotionResult & {
  expired: Hold[];
};

/**
 * Brings the drop up to date with the clock. Must run under the drop lock.
 * 1. Expires every ACTIVE hold whose `expires_at` has passed.
 * 2. Hands every free pair to the waitlist, first in line first.
 */
export async function reconcile(tx: Tx, drop: Drop, now: Date): Promise<ReconcileResult> {
  const expired = await tx
    .update(holds)
    .set({ status: "EXPIRED", endedAt: now })
    .where(and(eq(holds.dropId, drop.id), eq(holds.status, "ACTIVE"), lte(holds.expiresAt, now)))
    .returning();

  await audit(
    tx,
    expired.map((h) => ({
      entity: "hold" as const,
      entityId: h.id,
      dropId: drop.id,
      userId: h.userId,
      from: "ACTIVE",
      to: "EXPIRED",
      at: now,
    })),
  );

  const promotion = await promoteWaiters(tx, drop, now);
  return { expired, ...promotion };
}

/**
 * While a pair is free and someone is waiting, give the pair to the first
 * eligible waiter as a fresh hold. Runs in the same transaction that freed the
 * pair, so a free pair is never visible to a Buy click while the queue is non-empty.
 */
export async function promoteWaiters(tx: Tx, drop: Drop, now: Date): Promise<PromotionResult> {
  const promoted: Hold[] = [];
  const skipped: WaitlistEntry[] = [];
  let { available } = await getCounts(tx, drop.id);

  while (available > 0) {
    const [next] = await tx
      .select()
      .from(waitlistEntries)
      .where(and(eq(waitlistEntries.dropId, drop.id), eq(waitlistEntries.status, "WAITING")))
      .orderBy(asc(waitlistEntries.createdAt), asc(waitlistEntries.id))
      .limit(1);
    if (!next) break;

    if (!(await isEligible(tx, drop, next.userId))) {
      await tx
        .update(waitlistEntries)
        .set({ status: "SKIPPED", endedAt: now })
        .where(eq(waitlistEntries.id, next.id));
      await audit(tx, {
        entity: "waitlist",
        entityId: String(next.id),
        dropId: drop.id,
        userId: next.userId,
        from: "WAITING",
        to: "SKIPPED",
        at: now,
      });
      skipped.push(next);
      continue;
    }

    const [hold] = await tx
      .insert(holds)
      .values({
        dropId: drop.id,
        userId: next.userId,
        source: "waitlist",
        createdAt: now,
        expiresAt: new Date(now.getTime() + drop.holdSeconds * 1000),
      })
      .returning();
    await tx
      .update(waitlistEntries)
      .set({ status: "PROMOTED", endedAt: now, holdId: hold!.id })
      .where(eq(waitlistEntries.id, next.id));
    await audit(tx, [
      {
        entity: "waitlist",
        entityId: String(next.id),
        dropId: drop.id,
        userId: next.userId,
        from: "WAITING",
        to: "PROMOTED",
        meta: { holdId: hold!.id },
        at: now,
      },
      {
        entity: "hold",
        entityId: hold!.id,
        dropId: drop.id,
        userId: next.userId,
        to: "ACTIVE",
        meta: { source: "waitlist" },
        at: now,
      },
    ]);
    promoted.push(hold!);
    available -= 1;
  }

  return { promoted, skipped };
}

/** A waiter can be promoted if they hold nothing and are under the per-user limit. */
async function isEligible(tx: Tx, drop: Drop, userId: string): Promise<boolean> {
  const [active] = await tx
    .select({ n: count() })
    .from(holds)
    .where(and(eq(holds.dropId, drop.id), eq(holds.userId, userId), eq(holds.status, "ACTIVE")));
  if ((active?.n ?? 0) > 0) return false;
  const [bought] = await tx
    .select({ n: count() })
    .from(orders)
    .where(and(eq(orders.dropId, drop.id), eq(orders.userId, userId)));
  return (bought?.n ?? 0) < drop.maxPerUser;
}
