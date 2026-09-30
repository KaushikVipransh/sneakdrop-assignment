import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { holds, orders, paymentIntents, webhookEvents } from "@/server/db/schema";
import type { PaymentEventPayload, PaymentEventType } from "@/server/fakepay/provider";
import { createDrop, insertHold, insertWaiting } from "@/test/factories";
import { resetDb } from "@/test/db";
import { startPayment } from "./payments";
import { applyPaymentEvent } from "./webhook";

let seq = 0;
function eventFor(
  intent: { id: string; holdId: string; amount: number },
  type: PaymentEventType,
): PaymentEventPayload {
  return {
    id: `evt_test_${++seq}`,
    type,
    created_at: new Date().toISOString(),
    data: { intent_id: intent.id, hold_id: intent.holdId, amount: intent.amount },
  };
}

async function paidHold(overrides: { totalStock?: number } = {}) {
  const drop = await createDrop({ totalStock: overrides.totalStock ?? 20 });
  const hold = await insertHold(drop, "u1");
  const started = await startPayment("u1", hold.id);
  if (started.code !== "STARTED") throw new Error(started.code);
  return { drop, hold, intent: started.intent };
}

const intentStatus = async (id: string) =>
  (await db.select().from(paymentIntents).where(eq(paymentIntents.id, id)))[0]!.status;
const holdStatus = async (id: string) =>
  (await db.select().from(holds).where(eq(holds.id, id)))[0]!.status;

describe("applyPaymentEvent", () => {
  beforeEach(resetDb);
  afterAll(resetDb);

  it("success in time converts the hold into an order", async () => {
    const { hold, intent } = await paidHold();
    const result = await applyPaymentEvent(eventFor(intent, "payment.succeeded"));
    expect(result).toEqual({ code: "PROCESSED", outcome: "order_created" });
    expect(await holdStatus(hold.id)).toBe("CONVERTED");
    expect(await intentStatus(intent.id)).toBe("SUCCEEDED");
    expect(await db.select().from(orders)).toMatchObject([{ holdId: hold.id, userId: "u1" }]);
  });

  it("a duplicate event id is acknowledged and ignored", async () => {
    const { intent } = await paidHold();
    const event = eventFor(intent, "payment.succeeded");
    await applyPaymentEvent(event);
    expect(await applyPaymentEvent(event)).toEqual({ code: "DUPLICATE" });
    expect(await db.select().from(orders)).toHaveLength(1);
    expect(await db.select().from(webhookEvents)).toHaveLength(1);
  });

  it("parallel duplicates create one order", async () => {
    const { intent } = await paidHold();
    const event = eventFor(intent, "payment.succeeded");
    const results = await Promise.all([1, 2, 3].map(() => applyPaymentEvent(event)));
    expect(results.filter((r) => r.code === "PROCESSED")).toHaveLength(1);
    expect(await db.select().from(orders)).toHaveLength(1);
  });

  it("success after the hold expired refunds and creates no order", async () => {
    const { hold, intent } = await paidHold();
    await db
      .update(holds)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(holds.id, hold.id));
    const result = await applyPaymentEvent(eventFor(intent, "payment.succeeded"));
    expect(result).toEqual({ code: "PROCESSED", outcome: "late_refunded" });
    expect(await holdStatus(hold.id)).toBe("EXPIRED");
    expect(await intentStatus(intent.id)).toBe("REFUNDED");
    expect(await db.select().from(orders)).toHaveLength(0);
  });

  it("failure while pending releases the hold and promotes the next waiter", async () => {
    const { drop, hold, intent } = await paidHold({ totalStock: 1 });
    await insertWaiting(drop, "next");
    const result = await applyPaymentEvent(eventFor(intent, "payment.failed"));
    expect(result).toEqual({ code: "PROCESSED", outcome: "payment_failed" });
    expect(await intentStatus(intent.id)).toBe("FAILED");
    expect(await holdStatus(hold.id)).toBe("RELEASED");
    const active = await db.select().from(holds).where(eq(holds.status, "ACTIVE"));
    expect(active).toMatchObject([{ userId: "next", source: "waitlist" }]);
  });

  it("failure after success is ignored and the order stays", async () => {
    const { hold, intent } = await paidHold();
    await applyPaymentEvent(eventFor(intent, "payment.succeeded"));
    const result = await applyPaymentEvent(eventFor(intent, "payment.failed"));
    expect(result).toEqual({ code: "PROCESSED", outcome: "ignored_out_of_order" });
    expect(await intentStatus(intent.id)).toBe("SUCCEEDED");
    expect(await holdStatus(hold.id)).toBe("CONVERTED");
    expect(await db.select().from(orders)).toHaveLength(1);
  });

  it("success after failure is refunded", async () => {
    const { hold, intent } = await paidHold();
    await applyPaymentEvent(eventFor(intent, "payment.failed"));
    const result = await applyPaymentEvent(eventFor(intent, "payment.succeeded"));
    expect(result).toEqual({ code: "PROCESSED", outcome: "late_refunded" });
    expect(await intentStatus(intent.id)).toBe("REFUNDED");
    expect(await holdStatus(hold.id)).toBe("RELEASED");
    expect(await db.select().from(orders)).toHaveLength(0);
  });

  it("an event for an unknown intent is not recorded, so the provider retries", async () => {
    const result = await applyPaymentEvent(
      eventFor(
        { id: "00000000-0000-0000-0000-000000000000", holdId: "x", amount: 1 },
        "payment.succeeded",
      ),
    );
    expect(result).toEqual({ code: "UNKNOWN_INTENT" });
    expect(await db.select().from(webhookEvents)).toHaveLength(0);
  });
});
