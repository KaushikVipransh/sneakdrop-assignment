import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { auditLog, holds } from "@/server/db/schema";
import { createDrop, insertHold, insertOrder } from "@/test/factories";
import { resetDb } from "@/test/db";
import { createHold } from "./holds";

describe("createHold", () => {
  beforeEach(resetDb);
  afterAll(resetDb);

  it("creates a hold that expires hold_seconds from now", async () => {
    const drop = await createDrop({ holdSeconds: 300 });
    const now = new Date();
    const result = await createHold("u1", drop.id, { now });
    expect(result.code).toBe("HOLD_CREATED");
    if (result.code !== "HOLD_CREATED") return;
    expect(result.hold).toMatchObject({ userId: "u1", status: "ACTIVE", source: "buy" });
    expect(result.hold.expiresAt.getTime()).toBe(now.getTime() + 300_000);
    const audits = await db.select().from(auditLog);
    expect(audits).toMatchObject([{ entity: "hold", toStatus: "ACTIVE", userId: "u1" }]);
  });

  it("returns the existing hold when the user already holds one", async () => {
    const drop = await createDrop();
    const first = await createHold("u1", drop.id);
    const second = await createHold("u1", drop.id);
    expect(second.code).toBe("ALREADY_HOLDING");
    if (first.code !== "HOLD_CREATED" || second.code !== "ALREADY_HOLDING") return;
    expect(second.hold.id).toBe(first.hold.id);
    expect(await db.select().from(holds)).toHaveLength(1);
  });

  it("refuses when the user has reached the limit with orders alone", async () => {
    const drop = await createDrop({ maxPerUser: 2 });
    await insertOrder(drop, "u1");
    await insertOrder(drop, "u1");
    expect(await createHold("u1", drop.id)).toMatchObject({
      code: "LIMIT_REACHED",
      purchased: 2,
      limit: 2,
    });
  });

  it("allows a second pair after one order", async () => {
    const drop = await createDrop({ maxPerUser: 2 });
    await insertOrder(drop, "u1");
    expect((await createHold("u1", drop.id)).code).toBe("HOLD_CREATED");
  });

  it("returns SOLD_OUT when no pair is available", async () => {
    const drop = await createDrop({ totalStock: 2 });
    await insertOrder(drop, "a");
    await insertHold(drop, "b");
    expect(await createHold("u1", drop.id)).toMatchObject({ code: "SOLD_OUT" });
  });

  it("frees expired holds before checking stock", async () => {
    const drop = await createDrop({ totalStock: 1 });
    await insertHold(drop, "b", { expiresAt: new Date(Date.now() - 1000) });
    expect((await createHold("u1", drop.id)).code).toBe("HOLD_CREATED");
  });

  it("returns NOT_STARTED before the drop opens", async () => {
    const startsAt = new Date(Date.now() + 60_000);
    const drop = await createDrop({ startsAt });
    expect(await createHold("u1", drop.id)).toMatchObject({ code: "NOT_STARTED", startsAt });
  });
});
