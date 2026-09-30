import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db, withTx } from "@/server/db/client";
import { fakepaySettings, type Hold } from "@/server/db/schema";
import { createDrop, insertHold } from "@/test/factories";
import { resetDb } from "@/test/db";
import { createIntent } from "./provider";
import { seededRng } from "./rng";

async function setup(chaos: Partial<typeof fakepaySettings.$inferInsert> = {}) {
  await db.insert(fakepaySettings).values({ id: 1, ...chaos });
  const drop = await createDrop();
  return insertHold(drop, "u1");
}

const now = new Date("2026-10-15T10:00:00Z");
const run = (hold: Hold, seed = 1) =>
  withTx((tx) => createIntent(tx, hold, { now, rng: seededRng(seed) }));

describe("fakepay.createIntent", () => {
  beforeEach(resetDb);
  afterAll(resetDb);

  it("with no chaos schedules one immediate success", async () => {
    const hold = await setup();
    const { intent, deliveries } = await run(hold);
    expect(intent).toMatchObject({ holdId: hold.id, userId: "u1", status: "PENDING" });
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({
      type: "payment.succeeded",
      intentId: intent.id,
      deliverAt: now,
      status: "PENDING",
    });
    expect(deliveries[0]!.eventId).toMatch(/^evt_/);
    expect(deliveries[0]!.payload).toMatchObject({
      id: deliveries[0]!.eventId,
      type: "payment.succeeded",
      data: { intent_id: intent.id, hold_id: hold.id },
    });
  });

  it("fail_rate 1 schedules a failure", async () => {
    const hold = await setup({ failRate: 1 });
    const { deliveries } = await run(hold);
    expect(deliveries.map((d) => d.type)).toEqual(["payment.failed"]);
  });

  it("duplicate_rate 1 sends the same event id two or three times", async () => {
    const hold = await setup({ duplicateRate: 1 });
    const { deliveries } = await run(hold);
    expect(deliveries.length).toBeGreaterThanOrEqual(2);
    expect(deliveries.length).toBeLessThanOrEqual(3);
    expect(new Set(deliveries.map((d) => d.eventId)).size).toBe(1);
  });

  it("reorder_rate 1 adds a contradicting failure with its own event id", async () => {
    const hold = await setup({ reorderRate: 1 });
    const { deliveries } = await run(hold);
    expect(deliveries.map((d) => d.type).sort()).toEqual(["payment.failed", "payment.succeeded"]);
    expect(new Set(deliveries.map((d) => d.eventId)).size).toBe(2);
  });

  it("delays every delivery within the configured range", async () => {
    const hold = await setup({ minDelayMs: 1000, maxDelayMs: 420_000, duplicateRate: 1 });
    const { deliveries } = await run(hold, 7);
    for (const d of deliveries) {
      const delay = d.deliverAt.getTime() - now.getTime();
      expect(delay).toBeGreaterThanOrEqual(1000);
      expect(delay).toBeLessThanOrEqual(420_000);
    }
  });

  it("is deterministic for a fixed seed", async () => {
    const chaos = { minDelayMs: 0, maxDelayMs: 60_000, duplicateRate: 0.5, reorderRate: 0.5 };
    const shape = (ds: { type: string; deliverAt: Date }[]) =>
      ds.map((d) => [d.type, d.deliverAt.getTime()]);
    const hold = await setup(chaos);
    const a = await run(hold, 42);
    await resetDb();
    const hold2 = await setup(chaos);
    const b = await run(hold2, 42);
    expect(shape(b.deliveries)).toEqual(shape(a.deliveries));
  });
});
