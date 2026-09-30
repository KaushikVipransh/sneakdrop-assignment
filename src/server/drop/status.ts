import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { DropStatus, StatusHold } from "@/lib/status";
import { db, type Tx } from "../db/client";
import { auditLog, drops, holds, orders, paymentIntents, type Hold } from "../db/schema";
import { getCounts } from "./counts";
import { DropNotFound } from "./errors";
import { inDropTx } from "./tx";
import { getWaitlistLength, getWaitlistPosition } from "./waitlist";

export type StatusViewer = { id: string; email: string | null; isGuest: boolean };

const RECEIPT_LIMIT = 50;

/**
 * Expires due holds (and promotes waiters) only when something is actually due.
 * Status is polled every 1.5 s by every open page, so it must not take the drop
 * lock on every call; the check is one indexed query.
 */
export async function reconcileIfDue(dropId: string): Promise<boolean> {
  const { rows } = await db.execute<{ due: boolean }>(sql`
    select exists(
      select 1 from holds
      where drop_id = ${dropId} and status = 'ACTIVE' and expires_at <= clock_timestamp()
    ) as due
  `);
  if (!rows[0]?.due) return false;
  await inDropTx(dropId, {}, async () => undefined);
  return true;
}

const presentHold = (h: Hold): StatusHold => ({
  id: h.id,
  status: h.status,
  source: h.source,
  createdAt: h.createdAt.toISOString(),
  expiresAt: h.expiresAt.toISOString(),
  endedAt: h.endedAt?.toISOString() ?? null,
});

/** Everything the status page shows, read from one consistent snapshot. */
export async function getDropStatus(
  dropId: string,
  viewer: StatusViewer | null,
): Promise<DropStatus> {
  await reconcileIfDue(dropId);
  return db.transaction(
    async (tx) => {
      const [drop] = await tx.select().from(drops).where(eq(drops.id, dropId));
      if (!drop) throw new DropNotFound(dropId);
      const { rows } = await tx.execute<{ now: string }>(sql`select clock_timestamp() as now`);
      const counts = await getCounts(tx, dropId);
      return {
        serverTime: new Date(rows[0]!.now).toISOString(),
        drop: {
          id: drop.id,
          name: drop.name,
          total: counts.total,
          available: Math.max(counts.available, 0),
          sold: counts.sold,
          held: counts.held,
          waitlistLength: await getWaitlistLength(tx, dropId),
          startsAt: drop.startsAt.toISOString(),
          holdSeconds: drop.holdSeconds,
          maxPerUser: drop.maxPerUser,
        },
        me: viewer ? await getMe(tx, drop.id, drop.maxPerUser, viewer) : null,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

async function getMe(tx: Tx, dropId: string, limit: number, viewer: StatusViewer) {
  const userHolds = and(eq(holds.dropId, dropId), eq(holds.userId, viewer.id));
  const [latest] = await tx
    .select()
    .from(holds)
    .where(userHolds)
    .orderBy(desc(holds.createdAt))
    .limit(1);
  const [active] = await tx
    .select()
    .from(holds)
    .where(and(userHolds, eq(holds.status, "ACTIVE")))
    .limit(1);
  const [payment] = latest
    ? await tx
        .select({ id: paymentIntents.id, status: paymentIntents.status })
        .from(paymentIntents)
        .where(eq(paymentIntents.holdId, latest.id))
        .orderBy(desc(paymentIntents.createdAt))
        .limit(1)
    : [];
  const myOrders = await tx
    .select({ id: orders.id, createdAt: orders.createdAt })
    .from(orders)
    .where(and(eq(orders.dropId, dropId), eq(orders.userId, viewer.id)))
    .orderBy(asc(orders.createdAt));
  const events = await tx
    .select({
      at: auditLog.at,
      entity: auditLog.entity,
      from: auditLog.fromStatus,
      to: auditLog.toStatus,
    })
    .from(auditLog)
    .where(and(eq(auditLog.dropId, dropId), eq(auditLog.userId, viewer.id)))
    .orderBy(desc(auditLog.at), desc(auditLog.id))
    .limit(RECEIPT_LIMIT);

  return {
    userId: viewer.id,
    email: viewer.isGuest ? null : viewer.email,
    isGuest: viewer.isGuest,
    hold: active ? presentHold(active) : null,
    latestHold: latest ? presentHold(latest) : null,
    payment: payment ?? null,
    waitlistPosition: await getWaitlistPosition(tx, dropId, viewer.id),
    purchased: myOrders.length,
    limit,
    orders: myOrders.map((o) => ({ id: o.id, createdAt: o.createdAt.toISOString() })),
    events: events.reverse().map((e) => ({ ...e, at: e.at.toISOString() })),
  };
}

/** True when the fake provider has a webhook due; lets polls kick the dispatcher cheaply. */
export async function hasDueDeliveries(): Promise<boolean> {
  const { rows } = await db.execute<{ due: boolean }>(sql`
    select exists(
      select 1 from fakepay_deliveries where status = 'PENDING' and deliver_at <= now()
    ) as due
  `);
  return rows[0]?.due ?? false;
}
