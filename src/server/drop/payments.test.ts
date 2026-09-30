import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { fakepayDeliveries, paymentIntents } from "@/server/db/schema";
import { createDrop, insertHold } from "@/test/factories";
import { resetDb } from "@/test/db";
import { startPayment } from "./payments";

describe("startPayment", () => {
  beforeEach(resetDb);
  afterAll(resetDb);

  it("creates a pending intent and schedules its webhook", async () => {
    const drop = await createDrop();
    const hold = await insertHold(drop, "u1");
    const result = await startPayment("u1", hold.id);
    expect(result).toMatchObject({
      code: "STARTED",
      intent: { holdId: hold.id, status: "PENDING" },
    });
    expect(await db.select().from(fakepayDeliveries)).toHaveLength(1);
  });

  it("is idempotent while the payment is pending", async () => {
    const drop = await createDrop();
    const hold = await insertHold(drop, "u1");
    const first = await startPayment("u1", hold.id);
    const second = await startPayment("u1", hold.id);
    expect(second.code).toBe("ALREADY_PENDING");
    if (first.code !== "STARTED" || second.code !== "ALREADY_PENDING") return;
    expect(second.intent.id).toBe(first.intent.id);
    expect(await db.select().from(paymentIntents)).toHaveLength(1);
    expect(await db.select().from(fakepayDeliveries)).toHaveLength(1);
  });

  it("stays idempotent under parallel clicks", async () => {
    const drop = await createDrop();
    const hold = await insertHold(drop, "u1");
    const results = await Promise.all(
      Array.from({ length: 10 }, () => startPayment("u1", hold.id)),
    );
    expect(results.filter((r) => r.code === "STARTED")).toHaveLength(1);
    expect(await db.select().from(paymentIntents)).toHaveLength(1);
  });

  it("hides other users' holds", async () => {
    const drop = await createDrop();
    const hold = await insertHold(drop, "owner");
    expect(await startPayment("intruder", hold.id)).toEqual({ code: "NOT_FOUND" });
    expect(await startPayment("owner", "not-a-uuid")).toEqual({ code: "NOT_FOUND" });
  });

  it("refuses an expired or finished hold", async () => {
    const drop = await createDrop();
    const expired = await insertHold(drop, "a", { expiresAt: new Date(Date.now() - 1000) });
    const released = await insertHold(drop, "b", { status: "RELEASED", endedAt: new Date() });
    expect(await startPayment("a", expired.id)).toEqual({ code: "NOT_ACTIVE", status: "EXPIRED" });
    expect(await startPayment("b", released.id)).toEqual({
      code: "NOT_ACTIVE",
      status: "RELEASED",
    });
    expect(await db.select().from(paymentIntents)).toHaveLength(0);
  });
});
