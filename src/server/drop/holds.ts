import { eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { holds, type Hold, type HoldStatus } from "../db/schema";
import { audit } from "./audit";
import { getCounts } from "./counts";
import { promoteWaiters } from "./reconcile";
import { inDropTx, type ClockOptions } from "./tx";
import { findOwnedHoldDropId, getUserStanding } from "./user";
import { getWaitlistLength } from "./waitlist";

export type CreateHoldResult =
  | { code: "HOLD_CREATED"; hold: Hold }
  | { code: "ALREADY_HOLDING"; hold: Hold }
  | { code: "LIMIT_REACHED"; purchased: number; limit: number }
  | { code: "SOLD_OUT"; canJoinWaitlist: boolean }
  | { code: "NOT_STARTED"; startsAt: Date };

/**
 * Lock-free answer for the common case of a click on a sold-out drop: no free
 * pair, no hold due to expire, and the user holds nothing. Only ever answers
 * SOLD_OUT and never writes, so it cannot oversell; anything else (or any
 * doubt) goes through the locked path. At launch, this keeps the hundreds of
 * losing clicks from queueing behind the drop lock.
 */
async function isPlainlySoldOut(userId: string, dropId: string, now?: Date): Promise<boolean> {
  const at = now ?? sql`clock_timestamp()`;
  const { rows } = await db.execute<{ sold_out: boolean }>(sql`
    select
      d.starts_at <= ${at}
      and d.total_stock
        - (select count(*) from orders o where o.drop_id = d.id)
        - (select count(*) from holds h where h.drop_id = d.id and h.status = 'ACTIVE') <= 0
      and not exists (
        select 1 from holds h
        where h.drop_id = d.id and h.status = 'ACTIVE' and (h.expires_at <= ${at} or h.user_id = ${userId})
      ) as sold_out
    from drops d where d.id = ${dropId}
  `);
  return rows[0]?.sold_out === true;
}

/** Reserves one pair for the user, if the rules allow it. */
export async function createHold(
  userId: string,
  dropId: string,
  options: ClockOptions = {},
): Promise<CreateHoldResult> {
  if (await isPlainlySoldOut(userId, dropId, options.now)) {
    return { code: "SOLD_OUT", canJoinWaitlist: true };
  }
  return inDropTx(dropId, options, async ({ tx, drop, now }) => {
    if (now < drop.startsAt) return { code: "NOT_STARTED", startsAt: drop.startsAt };

    const standing = await getUserStanding(tx, drop.id, userId);
    if (standing.activeHold) return { code: "ALREADY_HOLDING", hold: standing.activeHold };
    // The limit counts orders plus active holds; the active hold is 0 here.
    if (standing.purchased >= drop.maxPerUser) {
      return { code: "LIMIT_REACHED", purchased: standing.purchased, limit: drop.maxPerUser };
    }

    const counts = await getCounts(tx, drop.id);
    if (counts.available < 1) return { code: "SOLD_OUT", canJoinWaitlist: true };
    // Queue first: reconcile already gave free pairs to waiters, so a non-empty
    // line here means none is left for a new click. Checked explicitly anyway.
    if ((await getWaitlistLength(tx, drop.id)) > 0) {
      return { code: "SOLD_OUT", canJoinWaitlist: true };
    }

    const [hold] = await tx
      .insert(holds)
      .values({
        dropId: drop.id,
        userId,
        source: "buy",
        createdAt: now,
        expiresAt: new Date(now.getTime() + drop.holdSeconds * 1000),
      })
      .returning();
    await audit(tx, {
      entity: "hold",
      entityId: hold!.id,
      dropId: drop.id,
      userId,
      to: "ACTIVE",
      meta: { source: "buy" },
      at: now,
    });
    return { code: "HOLD_CREATED", hold: hold! };
  });
}

export type ReleaseHoldResult =
  | { code: "RELEASED"; hold: Hold; promoted: Hold[] }
  | { code: "NOT_FOUND" }
  | { code: "NOT_ACTIVE"; status: HoldStatus };

/** Gives an active hold back. Only the owner can release it. */
export async function releaseHold(
  userId: string,
  holdId: string,
  options: ClockOptions = {},
): Promise<ReleaseHoldResult> {
  const dropId = await findOwnedHoldDropId(userId, holdId);
  if (!dropId) return { code: "NOT_FOUND" };

  return inDropTx(dropId, options, async ({ tx, drop, now }) => {
    const [hold] = await tx.select().from(holds).where(eq(holds.id, holdId));
    if (!hold) return { code: "NOT_FOUND" };
    if (hold.status !== "ACTIVE") return { code: "NOT_ACTIVE", status: hold.status };

    const [released] = await tx
      .update(holds)
      .set({ status: "RELEASED", endedAt: now })
      .where(eq(holds.id, holdId))
      .returning();
    await audit(tx, {
      entity: "hold",
      entityId: holdId,
      dropId: drop.id,
      userId,
      from: "ACTIVE",
      to: "RELEASED",
      meta: { reason: "user" },
      at: now,
    });
    // The freed pair goes to the next person in line within this transaction.
    const { promoted } = await promoteWaiters(tx, drop, now);
    return { code: "RELEASED", hold: released!, promoted };
  });
}
