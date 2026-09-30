import { and, eq, sql } from "drizzle-orm";
import type { Tx } from "../db/client";
import { waitlistEntries, type Hold, type WaitlistEntry } from "../db/schema";
import { audit } from "./audit";
import { getCounts } from "./counts";
import { inDropTx, type ClockOptions } from "./tx";
import { getUserStanding } from "./user";

export type JoinWaitlistResult =
  | { code: "JOINED"; entry: WaitlistEntry; position: number }
  | { code: "ALREADY_WAITING"; entry: WaitlistEntry; position: number }
  | { code: "STOCK_AVAILABLE" }
  | { code: "ALREADY_HOLDING"; hold: Hold }
  | { code: "LIMIT_REACHED"; purchased: number; limit: number }
  | { code: "NOT_STARTED"; startsAt: Date };

export type LeaveWaitlistResult = { code: "LEFT" } | { code: "NOT_WAITING" };

export async function getWaitingEntry(
  tx: Tx,
  dropId: string,
  userId: string,
): Promise<WaitlistEntry | null> {
  const [entry] = await tx
    .select()
    .from(waitlistEntries)
    .where(
      and(
        eq(waitlistEntries.dropId, dropId),
        eq(waitlistEntries.userId, userId),
        eq(waitlistEntries.status, "WAITING"),
      ),
    );
  return entry ?? null;
}

/** 1-based place in line among WAITING entries, or null if the user is not waiting. */
export async function getWaitlistPosition(
  tx: Tx,
  dropId: string,
  userId: string,
): Promise<number | null> {
  const { rows } = await tx.execute<{ position: number }>(sql`
    select count(*)::int as position
    from waitlist_entries w, waitlist_entries me
    where me.drop_id = ${dropId} and me.user_id = ${userId} and me.status = 'WAITING'
      and w.drop_id = me.drop_id and w.status = 'WAITING'
      and (w.created_at, w.id) <= (me.created_at, me.id)
  `);
  const position = rows[0]?.position ?? 0;
  return position > 0 ? position : null;
}

export async function getWaitlistLength(tx: Tx, dropId: string): Promise<number> {
  const { rows } = await tx.execute<{ n: number }>(sql`
    select count(*)::int as n from waitlist_entries
    where drop_id = ${dropId} and status = 'WAITING'
  `);
  return rows[0]?.n ?? 0;
}

/** Puts the user in line for the next pair that frees up. Idempotent. */
export function joinWaitlist(
  userId: string,
  dropId: string,
  options: ClockOptions = {},
): Promise<JoinWaitlistResult> {
  return inDropTx(dropId, options, async ({ tx, drop, now }) => {
    if (now < drop.startsAt) return { code: "NOT_STARTED", startsAt: drop.startsAt };

    const existing = await getWaitingEntry(tx, drop.id, userId);
    if (existing) {
      const position = (await getWaitlistPosition(tx, drop.id, userId)) ?? 0;
      return { code: "ALREADY_WAITING", entry: existing, position };
    }

    const standing = await getUserStanding(tx, drop.id, userId);
    if (standing.activeHold) return { code: "ALREADY_HOLDING", hold: standing.activeHold };
    if (standing.purchased >= drop.maxPerUser) {
      return { code: "LIMIT_REACHED", purchased: standing.purchased, limit: drop.maxPerUser };
    }

    // After reconcile, free stock means nobody is waiting: the user should just Buy.
    const counts = await getCounts(tx, drop.id);
    if (counts.available > 0) return { code: "STOCK_AVAILABLE" };

    const [entry] = await tx
      .insert(waitlistEntries)
      .values({ dropId: drop.id, userId, createdAt: now })
      .returning();
    await audit(tx, {
      entity: "waitlist",
      entityId: String(entry!.id),
      dropId: drop.id,
      userId,
      to: "WAITING",
      at: now,
    });
    const position = (await getWaitlistPosition(tx, drop.id, userId)) ?? 0;
    return { code: "JOINED", entry: entry!, position };
  });
}

/** Takes the user out of line. */
export function leaveWaitlist(
  userId: string,
  dropId: string,
  options: ClockOptions = {},
): Promise<LeaveWaitlistResult> {
  return inDropTx(dropId, options, async ({ tx, drop, now }) => {
    const entry = await getWaitingEntry(tx, drop.id, userId);
    if (!entry) return { code: "NOT_WAITING" };
    await tx
      .update(waitlistEntries)
      .set({ status: "LEFT", endedAt: now })
      .where(eq(waitlistEntries.id, entry.id));
    await audit(tx, {
      entity: "waitlist",
      entityId: String(entry.id),
      dropId: drop.id,
      userId,
      from: "WAITING",
      to: "LEFT",
      at: now,
    });
    return { code: "LEFT" };
  });
}
