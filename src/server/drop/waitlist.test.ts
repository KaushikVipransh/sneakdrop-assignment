import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db, withTx } from "@/server/db/client";
import { waitlistEntries } from "@/server/db/schema";
import { createDrop, insertHold, insertOrder } from "@/test/factories";
import { resetDb } from "@/test/db";
import { getWaitlistPosition, joinWaitlist, leaveWaitlist } from "./waitlist";

/** A drop with every pair held by someone else. */
async function soldOutDrop(total = 1, overrides = {}) {
  const drop = await createDrop({ totalStock: total, ...overrides });
  for (let i = 0; i < total; i++) await insertHold(drop, `holder-${i}`);
  return drop;
}

describe("joinWaitlist", () => {
  beforeEach(resetDb);
  afterAll(resetDb);

  it("adds the user at the back of the line when sold out", async () => {
    const drop = await soldOutDrop();
    expect(await joinWaitlist("a", drop.id)).toMatchObject({ code: "JOINED", position: 1 });
    expect(await joinWaitlist("b", drop.id)).toMatchObject({ code: "JOINED", position: 2 });
  });

  it("is idempotent", async () => {
    const drop = await soldOutDrop();
    const first = await joinWaitlist("a", drop.id);
    const second = await joinWaitlist("a", drop.id);
    expect(second).toMatchObject({ code: "ALREADY_WAITING", position: 1 });
    if (first.code !== "JOINED" || second.code !== "ALREADY_WAITING") return;
    expect(second.entry.id).toBe(first.entry.id);
    expect(await db.select().from(waitlistEntries)).toHaveLength(1);
  });

  it("refuses while stock is available", async () => {
    const drop = await createDrop({ totalStock: 1 });
    expect(await joinWaitlist("a", drop.id)).toEqual({ code: "STOCK_AVAILABLE" });
  });

  it("refuses a user who holds a pair", async () => {
    const drop = await createDrop({ totalStock: 1 });
    await insertHold(drop, "a");
    expect(await joinWaitlist("a", drop.id)).toMatchObject({ code: "ALREADY_HOLDING" });
  });

  it("refuses a user at the purchase limit", async () => {
    const drop = await createDrop({ totalStock: 3, maxPerUser: 2 });
    await insertOrder(drop, "a");
    await insertOrder(drop, "a");
    await insertHold(drop, "z");
    expect(await joinWaitlist("a", drop.id)).toMatchObject({ code: "LIMIT_REACHED" });
  });

  it("refuses before the drop opens", async () => {
    const drop = await createDrop({ startsAt: new Date(Date.now() + 60_000) });
    expect(await joinWaitlist("a", drop.id)).toMatchObject({ code: "NOT_STARTED" });
  });
});

describe("leaveWaitlist", () => {
  beforeEach(resetDb);
  afterAll(resetDb);

  it("marks the entry LEFT", async () => {
    const drop = await soldOutDrop();
    await joinWaitlist("a", drop.id);
    expect(await leaveWaitlist("a", drop.id)).toEqual({ code: "LEFT" });
    const [entry] = await db.select().from(waitlistEntries);
    expect(entry?.status).toBe("LEFT");
    expect(entry?.endedAt).not.toBeNull();
    expect(await leaveWaitlist("a", drop.id)).toEqual({ code: "NOT_WAITING" });
  });

  it("lets a user rejoin at the back after leaving", async () => {
    const drop = await soldOutDrop();
    await joinWaitlist("a", drop.id);
    await joinWaitlist("b", drop.id);
    await leaveWaitlist("a", drop.id);
    expect(await joinWaitlist("a", drop.id)).toMatchObject({ code: "JOINED", position: 2 });
  });
});

describe("getWaitlistPosition", () => {
  beforeEach(resetDb);
  afterAll(resetDb);

  it("is 1-based and closes gaps when someone leaves", async () => {
    const drop = await soldOutDrop();
    for (const u of ["u1", "u2", "u3", "u4", "u5"]) await joinWaitlist(u, drop.id);
    const positions = async () =>
      withTx(async (tx) => {
        const out: (number | null)[] = [];
        for (const u of ["u1", "u2", "u3", "u4", "u5"])
          out.push(await getWaitlistPosition(tx, drop.id, u));
        return out;
      });
    expect(await positions()).toEqual([1, 2, 3, 4, 5]);
    await leaveWaitlist("u2", drop.id);
    expect(await positions()).toEqual([1, null, 2, 3, 4]);
  });
});
