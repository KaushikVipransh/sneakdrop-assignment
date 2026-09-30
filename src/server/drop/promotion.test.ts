import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db, withTx } from "@/server/db/client";
import { holds, waitlistEntries } from "@/server/db/schema";
import { createDrop, insertHold, insertOrder, insertWaiting } from "@/test/factories";
import { resetDb } from "@/test/db";
import { getCounts } from "./counts";
import { lockDrop } from "./lock";
import { reconcile } from "./reconcile";

const ago = (ms: number) => new Date(Date.now() - ms);

async function runReconcile(dropId: string, now: Date) {
  return withTx(async (tx) => reconcile(tx, await lockDrop(tx, dropId), now));
}

async function entryOf(dropId: string, userId: string) {
  const [e] = await db
    .select()
    .from(waitlistEntries)
    .where(and(eq(waitlistEntries.dropId, dropId), eq(waitlistEntries.userId, userId)));
  return e!;
}

describe("reconcile — promotion", () => {
  beforeEach(resetDb);
  afterAll(resetDb);

  it("gives an expired pair to the first in line with a fresh hold", async () => {
    const drop = await createDrop({ totalStock: 1, holdSeconds: 300 });
    await insertHold(drop, "a", { expiresAt: ago(1000) });
    await insertWaiting(drop, "b", ago(3000));
    await insertWaiting(drop, "c", ago(2000));
    const now = new Date();

    const result = await runReconcile(drop.id, now);

    expect(result.expired).toHaveLength(1);
    expect(result.promoted).toHaveLength(1);
    const promoted = result.promoted[0]!;
    expect(promoted).toMatchObject({ userId: "b", source: "waitlist", status: "ACTIVE" });
    expect(promoted.expiresAt.getTime()).toBe(now.getTime() + 300_000);
    expect(await entryOf(drop.id, "b")).toMatchObject({ status: "PROMOTED", holdId: promoted.id });
    expect((await entryOf(drop.id, "c")).status).toBe("WAITING");
  });

  it("skips users who can no longer buy and promotes the next", async () => {
    const drop = await createDrop({ totalStock: 3, maxPerUser: 2 });
    await insertOrder(drop, "b");
    await insertOrder(drop, "b");
    await insertHold(drop, "a", { expiresAt: ago(1000) });
    await insertWaiting(drop, "b", ago(3000));
    await insertWaiting(drop, "c", ago(2000));

    const result = await runReconcile(drop.id, new Date());

    expect(result.skipped.map((e) => e.userId)).toEqual(["b"]);
    expect(result.promoted.map((h) => h.userId)).toEqual(["c"]);
    expect((await entryOf(drop.id, "b")).status).toBe("SKIPPED");
  });

  it("returns the pair to stock when nobody is waiting", async () => {
    const drop = await createDrop({ totalStock: 1 });
    await insertHold(drop, "a", { expiresAt: ago(1000) });
    const result = await runReconcile(drop.id, new Date());
    expect(result.promoted).toEqual([]);
    expect(await withTx((tx) => getCounts(tx, drop.id))).toMatchObject({ available: 1 });
  });

  it("promotes as many waiters as there are free pairs, in order", async () => {
    const drop = await createDrop({ totalStock: 2 });
    await insertHold(drop, "a", { expiresAt: ago(1000) });
    await insertHold(drop, "b", { expiresAt: ago(1000) });
    await insertWaiting(drop, "w1", ago(3000));
    await insertWaiting(drop, "w2", ago(2000));
    await insertWaiting(drop, "w3", ago(1000));

    const result = await runReconcile(drop.id, new Date());

    expect(result.promoted.map((h) => h.userId)).toEqual(["w1", "w2"]);
    expect((await entryOf(drop.id, "w3")).status).toBe("WAITING");
    const active = await db
      .select()
      .from(holds)
      .where(and(eq(holds.dropId, drop.id), eq(holds.status, "ACTIVE")));
    expect(active).toHaveLength(2);
  });
});
