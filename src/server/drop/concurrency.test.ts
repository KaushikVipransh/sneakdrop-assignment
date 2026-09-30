import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { holds } from "@/server/db/schema";
import { createDrop } from "@/test/factories";
import { resetDb } from "@/test/db";
import { createHold, type CreateHoldResult } from "./holds";

function tally(results: PromiseSettledResult<CreateHoldResult>[]) {
  const counts: Record<string, number> = {};
  for (const r of results) {
    const key = r.status === "fulfilled" ? r.value.code : "ERROR";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

describe("createHold under concurrency", () => {
  beforeEach(resetDb);
  afterAll(resetDb);

  for (let run = 1; run <= 5; run++) {
    it(`1,000 users racing for 20 pairs get exactly 20 holds (run ${run})`, async () => {
      const drop = await createDrop({ totalStock: 20 });
      const results = await Promise.allSettled(
        Array.from({ length: 1000 }, (_, i) => createHold(`user-${i}`, drop.id)),
      );
      expect(tally(results)).toEqual({ HOLD_CREATED: 20, SOLD_OUT: 980 });
      const active = await db.select().from(holds).where(eq(holds.dropId, drop.id));
      expect(active).toHaveLength(20);
      expect(new Set(active.map((h) => h.userId)).size).toBe(20);
    });
  }

  it("one user clicking Buy 50 times in parallel gets one hold", async () => {
    const drop = await createDrop();
    const results = await Promise.allSettled(
      Array.from({ length: 50 }, () => createHold("same-user", drop.id)),
    );
    expect(tally(results)).toEqual({ HOLD_CREATED: 1, ALREADY_HOLDING: 49 });
    const rows = await db.select().from(holds).where(eq(holds.dropId, drop.id));
    expect(rows).toHaveLength(1);
    const ids = new Set(
      results.map((r) => (r.status === "fulfilled" && "hold" in r.value ? r.value.hold.id : null)),
    );
    expect(ids).toEqual(new Set([rows[0]!.id]));
  });
});
