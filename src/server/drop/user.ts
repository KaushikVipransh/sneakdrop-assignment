import { and, count, eq } from "drizzle-orm";
import { db, type Tx } from "../db/client";
import { holds, orders, type Hold } from "../db/schema";
import { isUuid } from "./ids";

export type UserStanding = {
  activeHold: Hold | null;
  purchased: number;
};

/** A user's active hold and confirmed order count for one drop. */
export async function getUserStanding(
  tx: Tx,
  dropId: string,
  userId: string,
): Promise<UserStanding> {
  const [activeHold] = await tx
    .select()
    .from(holds)
    .where(and(eq(holds.dropId, dropId), eq(holds.userId, userId), eq(holds.status, "ACTIVE")))
    .limit(1);
  const [row] = await tx
    .select({ n: count() })
    .from(orders)
    .where(and(eq(orders.dropId, dropId), eq(orders.userId, userId)));
  return { activeHold: activeHold ?? null, purchased: row?.n ?? 0 };
}

/**
 * The drop id of a hold owned by the user, or null. Read without a lock, only
 * to learn which drop lock to take; callers re-read the hold under the lock.
 */
export async function findOwnedHoldDropId(userId: string, holdId: string): Promise<string | null> {
  if (!isUuid(holdId)) return null;
  const [found] = await db
    .select({ dropId: holds.dropId })
    .from(holds)
    .where(and(eq(holds.id, holdId), eq(holds.userId, userId)));
  return found?.dropId ?? null;
}
