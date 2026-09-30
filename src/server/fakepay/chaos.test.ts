/**
 * End-to-end chaos: real DB, real signed HTTP deliveries from the dispatcher to
 * the webhook route. Time passing is simulated by moving `expires_at` into the past.
 */
import { asc, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/webhooks/payments/route";
import { db, withTx } from "@/server/db/client";
import {
  fakepayDeliveries,
  fakepaySettings,
  holds,
  orders,
  paymentIntents,
  webhookEvents,
  type Drop,
} from "@/server/db/schema";
import { assertInvariant } from "@/server/drop/invariant";
import { createHold } from "@/server/drop/holds";
import { startPayment } from "@/server/drop/payments";
import { joinWaitlist } from "@/server/drop/waitlist";
import { createDrop } from "@/test/factories";
import { resetDb } from "@/test/db";
import { serveHandler } from "@/test/http-server";
import { dispatchDue } from "./dispatcher";

let server: Awaited<ReturnType<typeof serveHandler>>;
const dispatch = () => dispatchDue({ webhookUrl: `${server.url}/api/webhooks/payments` });

async function buyAndPay(drop: Drop, userId: string) {
  const created = await createHold(userId, drop.id);
  if (created.code !== "HOLD_CREATED") throw new Error(created.code);
  const started = await startPayment(userId, created.hold.id);
  if (started.code !== "STARTED") throw new Error(started.code);
  return { hold: created.hold, intent: started.intent };
}

/** Makes only deliveries of `type` due now; everything else waits. */
async function onlyDue(type: string) {
  await db.update(fakepayDeliveries).set({ deliverAt: new Date(Date.now() + 3_600_000) });
  await db
    .update(fakepayDeliveries)
    .set({ deliverAt: new Date(Date.now() - 1) })
    .where(eq(fakepayDeliveries.type, type));
}

const outcomes = async () =>
  (await db.select().from(webhookEvents).orderBy(asc(webhookEvents.receivedAt))).map(
    (e) => e.outcome,
  );

describe("payment chaos end to end", () => {
  beforeAll(async () => {
    server = await serveHandler(POST);
  });
  afterAll(async () => {
    await server.close();
    await resetDb();
  });
  beforeEach(resetDb);
  afterEach(async () => {
    const drops = await db.query.drops.findMany();
    for (const d of drops) await withTx((tx) => assertInvariant(tx, d.id));
  });

  it("a success delivered three times creates one order", async () => {
    await db.insert(fakepaySettings).values({ id: 1 });
    const drop = await createDrop();
    const { intent } = await buyAndPay(drop, "u1");
    const [original] = await db.select().from(fakepayDeliveries);
    const { id: _omit, ...copy } = original!; // eslint-disable-line @typescript-eslint/no-unused-vars
    await db.insert(fakepayDeliveries).values([copy, copy]);

    const result = await dispatch();

    expect(result).toMatchObject({ claimed: 3, delivered: 3 });
    expect(await db.select().from(orders)).toHaveLength(1);
    expect(await db.select().from(webhookEvents)).toHaveLength(1);
    const [finalIntent] = await db
      .select()
      .from(paymentIntents)
      .where(eq(paymentIntents.id, intent.id));
    expect(finalIntent!.status).toBe("SUCCEEDED");
  });

  it("a success arriving after 6 minutes is refunded and the next waiter gets the pair", async () => {
    await db.insert(fakepaySettings).values({ id: 1, minDelayMs: 360_000, maxDelayMs: 360_000 });
    const drop = await createDrop({ totalStock: 1 });
    const { hold, intent } = await buyAndPay(drop, "u1");
    expect((await joinWaitlist("next", drop.id)).code).toBe("JOINED");
    expect((await dispatch()).claimed).toBe(0); // not due yet

    // Six minutes pass: the hold is past its 5 minutes and the webhook is now due.
    await db
      .update(holds)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(holds.id, hold.id));
    await db.update(fakepayDeliveries).set({ deliverAt: new Date(Date.now() - 1) });
    await dispatch();

    expect(await outcomes()).toEqual(["late_refunded"]);
    expect(await db.select().from(orders)).toHaveLength(0);
    const [finalIntent] = await db
      .select()
      .from(paymentIntents)
      .where(eq(paymentIntents.id, intent.id));
    expect(finalIntent!.status).toBe("REFUNDED");
    const active = await db.select().from(holds).where(eq(holds.status, "ACTIVE"));
    expect(active).toMatchObject([{ userId: "next", source: "waitlist" }]);
  });

  it("a failure after the success is ignored and the order stays", async () => {
    await db.insert(fakepaySettings).values({ id: 1, reorderRate: 1 });
    const drop = await createDrop();
    const { hold } = await buyAndPay(drop, "u1");

    await onlyDue("payment.succeeded");
    await dispatch();
    await onlyDue("payment.failed");
    await dispatch();

    expect(await outcomes()).toEqual(["order_created", "ignored_out_of_order"]);
    expect(await db.select().from(orders)).toMatchObject([{ holdId: hold.id }]);
  });

  it("a failure before the success releases the hold and refunds the success", async () => {
    await db.insert(fakepaySettings).values({ id: 1, reorderRate: 1 });
    const drop = await createDrop({ totalStock: 1 });
    const { hold, intent } = await buyAndPay(drop, "u1");
    expect((await joinWaitlist("next", drop.id)).code).toBe("JOINED");

    await onlyDue("payment.failed");
    await dispatch();
    const [released] = await db.select().from(holds).where(eq(holds.id, hold.id));
    expect(released!.status).toBe("RELEASED");

    await onlyDue("payment.succeeded");
    await dispatch();

    expect(await outcomes()).toEqual(["payment_failed", "late_refunded"]);
    expect(await db.select().from(orders)).toHaveLength(0);
    const [finalIntent] = await db
      .select()
      .from(paymentIntents)
      .where(eq(paymentIntents.id, intent.id));
    expect(finalIntent!.status).toBe("REFUNDED");
    const active = await db.select().from(holds).where(eq(holds.status, "ACTIVE"));
    expect(active).toMatchObject([{ userId: "next" }]);
  });
});
