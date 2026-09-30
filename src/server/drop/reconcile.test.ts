import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db, withTx } from "@/server/db/client";
import { auditLog, holds } from "@/server/db/schema";
import { createDrop, insertHold } from "@/test/factories";
import { resetDb } from "@/test/db";
import { lockDrop } from "./lock";
import { reconcile } from "./reconcile";

describe("reconcile — expiry", () => {
  beforeEach(resetDb);
  afterAll(resetDb);

  it("expires due holds and leaves the rest ACTIVE", async () => {
    const drop = await createDrop();
    const now = new Date();
    const due = await insertHold(drop, "due", { expiresAt: new Date(now.getTime() - 1) });
    const exact = await insertHold(drop, "exact", { expiresAt: now });
    const live = await insertHold(drop, "live", { expiresAt: new Date(now.getTime() + 1000) });

    const result = await withTx(async (tx) => reconcile(tx, await lockDrop(tx, drop.id), now));

    expect(result.expired.map((h) => h.id).sort()).toEqual([due.id, exact.id].sort());
    const byId = async (id: string) => (await db.select().from(holds).where(eq(holds.id, id)))[0]!;
    expect((await byId(due.id)).status).toBe("EXPIRED");
    expect((await byId(due.id)).endedAt).toEqual(now);
    expect((await byId(exact.id)).status).toBe("EXPIRED");
    expect((await byId(live.id)).status).toBe("ACTIVE");
  });

  it("writes an audit row per expired hold", async () => {
    const drop = await createDrop();
    const now = new Date();
    const hold = await insertHold(drop, "u1", { expiresAt: new Date(now.getTime() - 1) });

    await withTx(async (tx) => reconcile(tx, await lockDrop(tx, drop.id), now));

    const rows = await db.select().from(auditLog);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      entity: "hold",
      entityId: hold.id,
      dropId: drop.id,
      userId: "u1",
      fromStatus: "ACTIVE",
      toStatus: "EXPIRED",
    });
  });

  it("is a no-op when nothing is due", async () => {
    const drop = await createDrop();
    await insertHold(drop, "u1");
    const result = await withTx(async (tx) =>
      reconcile(tx, await lockDrop(tx, drop.id), new Date()),
    );
    expect(result.expired).toEqual([]);
    expect(await db.select().from(auditLog)).toEqual([]);
  });
});
