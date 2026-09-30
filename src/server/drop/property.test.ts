import { and, count, eq, sql } from "drizzle-orm";
import fc from "fast-check";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { holds, orders, waitlistEntries } from "@/server/db/schema";
import { createDrop } from "@/test/factories";
import { resetDb } from "@/test/db";
import { audit } from "./audit";
import { getCounts } from "./counts";
import { createHold, releaseHold } from "./holds";
import { inDropTx } from "./tx";
import { joinWaitlist, leaveWaitlist } from "./waitlist";

const USERS = Array.from({ length: 50 }, (_, i) => `u${i}`);
const user = fc.constantFrom(...USERS);

type Command =
  | { op: "buy"; user: string }
  | { op: "release"; user: string }
  | { op: "pay"; user: string }
  | { op: "join"; user: string }
  | { op: "leave"; pick: number }
  | { op: "advance"; ms: number };

const command: fc.Arbitrary<Command> = fc.oneof(
  { weight: 5, arbitrary: user.map((u) => ({ op: "buy" as const, user: u })) },
  { weight: 2, arbitrary: user.map((u) => ({ op: "release" as const, user: u })) },
  { weight: 3, arbitrary: user.map((u) => ({ op: "pay" as const, user: u })) },
  { weight: 3, arbitrary: user.map((u) => ({ op: "join" as const, user: u })) },
  { weight: 1, arbitrary: fc.nat().map((pick) => ({ op: "leave" as const, pick })) },
  {
    weight: 2,
    arbitrary: fc.integer({ min: 0, max: 400_000 }).map((ms) => ({ op: "advance" as const, ms })),
  },
);

/** Stands in for a successful, in-time payment: converts the user's active hold. */
function convertActiveHold(userId: string, dropId: string, now: Date) {
  return inDropTx(dropId, { now }, async ({ tx, drop }) => {
    const [hold] = await tx
      .update(holds)
      .set({ status: "CONVERTED", endedAt: now })
      .where(and(eq(holds.dropId, drop.id), eq(holds.userId, userId), eq(holds.status, "ACTIVE")))
      .returning();
    if (!hold) return;
    await tx.insert(orders).values({ dropId: drop.id, userId, holdId: hold.id, createdAt: now });
    await audit(tx, { entity: "hold", entityId: hold.id, from: "ACTIVE", to: "CONVERTED" });
  });
}

async function activeHoldId(dropId: string, userId: string) {
  const [h] = await db
    .select({ id: holds.id })
    .from(holds)
    .where(and(eq(holds.dropId, dropId), eq(holds.userId, userId), eq(holds.status, "ACTIVE")));
  return h?.id;
}

describe("random operation sequences", () => {
  beforeAll(resetDb);
  afterAll(resetDb);

  it("never oversell and never exceed per-user limits", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 6 }),
        fc.array(command, { minLength: 1, maxLength: 30 }),
        async (totalStock, commands) => {
          let now = new Date(Date.now() + 1000);
          const drop = await createDrop({ totalStock, maxPerUser: 2, startsAt: new Date() });

          for (const c of commands) {
            switch (c.op) {
              case "buy":
                await createHold(c.user, drop.id, { now });
                break;
              case "release": {
                const id = await activeHoldId(drop.id, c.user);
                if (id) await releaseHold(c.user, id, { now });
                break;
              }
              case "pay":
                await convertActiveHold(c.user, drop.id, now);
                break;
              case "join":
                await joinWaitlist(c.user, drop.id, { now });
                break;
              case "leave": {
                // Pick among users actually in line, so leaving is exercised.
                const waiting = await db
                  .select({ userId: waitlistEntries.userId })
                  .from(waitlistEntries)
                  .where(
                    and(eq(waitlistEntries.dropId, drop.id), eq(waitlistEntries.status, "WAITING")),
                  );
                const who = waiting[c.pick % Math.max(waiting.length, 1)]?.userId;
                if (who) await leaveWaitlist(who, drop.id, { now });
                break;
              }
              case "advance":
                now = new Date(now.getTime() + c.ms);
                break;
            }

            // Every mutation already ran assertInvariant before commit; check again from outside.
            const counts = await db.transaction((tx) => getCounts(tx, drop.id));
            expect(counts.sold).toBeLessThanOrEqual(totalStock);
            expect(counts.sold + counts.held).toBeLessThanOrEqual(totalStock);
          }

          const perUser = await db
            .select({ userId: orders.userId, n: count() })
            .from(orders)
            .where(eq(orders.dropId, drop.id))
            .groupBy(orders.userId)
            .having(sql`count(*) > 2`);
          expect(perUser).toEqual([]);
        },
      ),
      { numRuns: 500 },
    );

    // The runs must actually reach the interesting paths, or the property proves little.
    const { rows } = await db.execute<{ to_status: string; n: number }>(
      sql`select to_status, count(*)::int as n from audit_log group by to_status`,
    );
    const seen = Object.fromEntries(rows.map((r) => [r.to_status, r.n]));
    for (const status of ["EXPIRED", "RELEASED", "CONVERTED", "PROMOTED", "LEFT"]) {
      expect(seen[status] ?? 0, status).toBeGreaterThan(0);
    }
  }, 600_000);
});
