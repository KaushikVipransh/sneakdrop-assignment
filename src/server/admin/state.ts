import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { AdminState } from "@/lib/admin-state";
import { db, type Tx } from "../db/client";
import { auditLog, holds, paymentIntents, waitlistEntries } from "../db/schema";
import { getCounts } from "../drop/counts";
import { getCurrentDrop } from "../drop/current";
import { InvariantViolation } from "../drop/errors";
import { assertInvariant } from "../drop/invariant";
import { reconcileIfDue } from "../drop/status";
import { getWaitlistLength } from "../drop/waitlist";
import { getSettings } from "../fakepay/provider";

async function checkInvariant(tx: Tx, dropId: string, total: number) {
  try {
    await assertInvariant(tx, dropId);
    return { ok: true, message: `orders + holds ≤ ${total}` };
  } catch (error) {
    if (error instanceof InvariantViolation) return { ok: false, message: error.message };
    throw error;
  }
}

/** Everything the operator console shows, from one read-only snapshot. */
export async function getAdminState(): Promise<AdminState> {
  const drop = await getCurrentDrop();
  if (drop) await reconcileIfDue(drop.id);

  return db.transaction(
    async (tx) => {
      const { rows: clock } = await tx.execute<{ now: string }>(
        sql`select clock_timestamp() as now`,
      );
      const { rows: delivery } = await tx.execute<{ status: string; n: number }>(sql`
        select status, count(*)::int as n from fakepay_deliveries group by status
      `);
      const byStatus = Object.fromEntries(delivery.map((r) => [r.status, r.n]));
      const settings = await getSettings(tx);
      const chaos = {
        minDelayMs: settings.minDelayMs,
        maxDelayMs: settings.maxDelayMs,
        duplicateRate: settings.duplicateRate,
        reorderRate: settings.reorderRate,
        failRate: settings.failRate,
      };
      const deliveries = {
        pending: byStatus.PENDING ?? 0,
        delivered: byStatus.DELIVERED ?? 0,
        dead: byStatus.DEAD ?? 0,
      };
      const serverTime = new Date(clock[0]!.now).toISOString();

      if (!drop) {
        return {
          serverTime,
          drop: null,
          activeHolds: [],
          waitlist: [],
          webhooks: [],
          deliveries,
          chaos,
        };
      }

      const counts = await getCounts(tx, drop.id);
      const { rows: refundRows } = await tx.execute<{ n: number }>(sql`
        select count(*)::int as n from payment_intents
        where drop_id = ${drop.id} and status = 'REFUNDED'
      `);

      const active = await tx
        .select({
          id: holds.id,
          userId: holds.userId,
          source: holds.source,
          expiresAt: holds.expiresAt,
          payment: paymentIntents.status,
        })
        .from(holds)
        .leftJoin(
          paymentIntents,
          and(eq(paymentIntents.holdId, holds.id), eq(paymentIntents.status, "PENDING")),
        )
        .where(and(eq(holds.dropId, drop.id), eq(holds.status, "ACTIVE")))
        .orderBy(asc(holds.expiresAt));

      const waiting = await tx
        .select({ userId: waitlistEntries.userId, joinedAt: waitlistEntries.createdAt })
        .from(waitlistEntries)
        .where(and(eq(waitlistEntries.dropId, drop.id), eq(waitlistEntries.status, "WAITING")))
        .orderBy(asc(waitlistEntries.createdAt), asc(waitlistEntries.id))
        .limit(20);

      const webhooks = await tx
        .select({
          at: auditLog.at,
          eventId: auditLog.entityId,
          outcome: auditLog.toStatus,
          type: sql<string | null>`${auditLog.meta}->>'type'`,
        })
        .from(auditLog)
        .where(and(eq(auditLog.dropId, drop.id), eq(auditLog.entity, "webhook")))
        .orderBy(desc(auditLog.at), desc(auditLog.id))
        .limit(50);

      return {
        serverTime,
        drop: {
          id: drop.id,
          name: drop.name,
          total: counts.total,
          sold: counts.sold,
          held: counts.held,
          available: Math.max(0, counts.available),
          waitlistLength: await getWaitlistLength(tx, drop.id),
          refunds: refundRows[0]?.n ?? 0,
          invariant: await checkInvariant(tx, drop.id, counts.total),
        },
        activeHolds: active.map((h) => ({
          id: h.id,
          userId: h.userId,
          source: h.source,
          expiresAt: h.expiresAt.toISOString(),
          payment: h.payment,
        })),
        waitlist: waiting.map((w, i) => ({
          position: i + 1,
          userId: w.userId,
          joinedAt: w.joinedAt.toISOString(),
        })),
        webhooks: webhooks.map((w) => ({ ...w, at: w.at.toISOString() })),
        deliveries,
        chaos,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
