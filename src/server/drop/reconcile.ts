import { and, eq, lte } from "drizzle-orm";
import type { Tx } from "../db/client";
import { holds, type Drop, type Hold } from "../db/schema";
import { audit } from "./audit";

export type ReconcileResult = {
  expired: Hold[];
};

/**
 * Brings the drop up to date with the clock. Must run under the drop lock.
 * Expires every ACTIVE hold whose `expires_at` has passed.
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

  return { expired };
}
