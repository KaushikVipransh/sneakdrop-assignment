import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { auditLog, holds } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { createDrop, insertHold, insertOrder, insertWaiting } from "@/test/factories";
import { joinWaitlist } from "./waitlist";
import { resetDb } from "@/test/db";
import { createHold, releaseHold } from "./holds";

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

describe("releaseHold", () => {
  beforeEach(resetDb);
  afterAll(resetDb);

  it("lets the owner release an active hold and returns the pair to stock", async () => {
    const drop = await createDrop({ totalStock: 1 });
    const created = await createHold("u1", drop.id);
    if (created.code !== "HOLD_CREATED") throw new Error(created.code);

    const result = await releaseHold("u1", created.hold.id);
    expect(result).toMatchObject({ code: "RELEASED", hold: { status: "RELEASED" } });
    expect((await createHold("u2", drop.id)).code).toBe("HOLD_CREATED");
  });

  it("hides other users' holds as NOT_FOUND", async () => {
    const drop = await createDrop();
    const hold = await insertHold(drop, "owner");
    expect(await releaseHold("intruder", hold.id)).toEqual({ code: "NOT_FOUND" });
    expect(await releaseHold("u1", "00000000-0000-0000-0000-000000000000")).toEqual({
      code: "NOT_FOUND",
    });
  });

  it("refuses a hold that is already terminal", async () => {
    const drop = await createDrop();
    const hold = await insertHold(drop, "u1", { status: "CONVERTED", endedAt: new Date() });
    expect(await releaseHold("u1", hold.id)).toEqual({ code: "NOT_ACTIVE", status: "CONVERTED" });
  });

  it("treats a hold past its expiry as expired, not releasable", async () => {
    const drop = await createDrop();
    const hold = await insertHold(drop, "u1", { expiresAt: new Date(Date.now() - 1000) });
    expect(await releaseHold("u1", hold.id)).toEqual({ code: "NOT_ACTIVE", status: "EXPIRED" });
  });
});

describe("queue first", () => {
  beforeEach(resetDb);
  afterAll(resetDb);

  it("gives a free pair to the waitlist, not to a new Buy click", async () => {
    const drop = await createDrop({ totalStock: 1 });
    // A free pair and a waiter at the same time (the state right after a hold ends).
    await insertWaiting(drop, "waiter");

    expect(await createHold("clicker", drop.id)).toEqual({
      code: "SOLD_OUT",
      canJoinWaitlist: true,
    });
    const [hold] = await db.select().from(holds);
    expect(hold).toMatchObject({ userId: "waiter", source: "waitlist" });
  });

  it("still sells normally once the line is empty", async () => {
    const drop = await createDrop({ totalStock: 2 });
    await insertWaiting(drop, "waiter");
    expect((await createHold("clicker", drop.id)).code).toBe("HOLD_CREATED");
  });
});

describe("release triggers promotion", () => {
  beforeEach(resetDb);
  afterAll(resetDb);

  it("hands a released pair to the first waiter in the same transaction", async () => {
    const drop = await createDrop({ totalStock: 1, holdSeconds: 300 });
    const created = await createHold("a", drop.id);
    if (created.code !== "HOLD_CREATED") throw new Error(created.code);
    await joinWaitlist("b", drop.id);

    const result = await releaseHold("a", created.hold.id);

    expect(result).toMatchObject({ code: "RELEASED", promoted: [{ userId: "b" }] });
    const active = await db.select().from(holds).where(eq(holds.status, "ACTIVE"));
    expect(active).toMatchObject([{ userId: "b", source: "waitlist" }]);
  });
});

describe("createHold in a sold-out drop", () => {
  beforeEach(resetDb);
  afterAll(resetDb);

  it("still returns the caller's own hold", async () => {
    const drop = await createDrop({ totalStock: 1 });
    const mine = await insertHold(drop, "u1");
    expect(await createHold("u1", drop.id)).toMatchObject({
      code: "ALREADY_HOLDING",
      hold: { id: mine.id },
    });
  });

  it("still frees a due hold and sells it", async () => {
    const drop = await createDrop({ totalStock: 1 });
    await insertHold(drop, "other", { expiresAt: new Date(Date.now() - 1) });
    expect((await createHold("u1", drop.id)).code).toBe("HOLD_CREATED");
  });

  it("answers SOLD_OUT without writing anything", async () => {
    const drop = await createDrop({ totalStock: 1 });
    await insertHold(drop, "other");
    const before = await db.select().from(auditLog);
    expect((await createHold("u1", drop.id)).code).toBe("SOLD_OUT");
    expect(await db.select().from(auditLog)).toEqual(before);
  });
});
