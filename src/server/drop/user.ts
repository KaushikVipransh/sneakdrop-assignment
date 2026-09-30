import { and, count, eq } from "drizzle-orm";
import type { Tx } from "../db/client";
import { holds, orders, type Hold } from "../db/schema";

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
