import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db, withTx } from "@/server/db/client";
import { waitlistEntries } from "@/server/db/schema";
import { createDrop, insertHold, insertOrder } from "@/test/factories";
import { resetDb } from "@/test/db";
import { InvariantViolation } from "./errors";
import { joinWaitlist } from "./waitlist";
import { assertInvariant } from "./invariant";

describe("assertInvariant", () => {
  beforeEach(resetDb);
  afterAll(resetDb);

  it("passes for a consistent drop", async () => {
    const drop = await createDrop({ totalStock: 2 });
    await insertOrder(drop, "a");
    await insertHold(drop, "b");
    await expect(withTx((tx) => assertInvariant(tx, drop.id))).resolves.toBeUndefined();
  });

  it("throws when orders exceed stock", async () => {
    const drop = await createDrop({ totalStock: 1 });
    await insertOrder(drop, "a");
    await insertOrder(drop, "b");
    await expect(withTx((tx) => assertInvariant(tx, drop.id))).rejects.toBeInstanceOf(
      InvariantViolation,
    );
  });

  it("throws when orders plus active holds exceed stock", async () => {
    const drop = await createDrop({ totalStock: 1 });
    await insertOrder(drop, "a");
    await insertHold(drop, "b");
    await expect(withTx((tx) => assertInvariant(tx, drop.id))).rejects.toThrow(/orders \+ active/);
  });

  it("throws when a user exceeds the per-user limit", async () => {
    const drop = await createDrop({ totalStock: 10, maxPerUser: 2 });
    await insertOrder(drop, "a");
    await insertOrder(drop, "a");
    await insertHold(drop, "a");
    await expect(withTx((tx) => assertInvariant(tx, drop.id))).rejects.toThrow(/per-user/);
  });

  it("rolls back a mutation that would commit a violation", async () => {
    const drop = await createDrop({ totalStock: 1 });
    await insertOrder(drop, "a");
    await insertOrder(drop, "b"); // corrupt state: 2 orders for 1 pair
    await expect(joinWaitlist("c", drop.id)).rejects.toBeInstanceOf(InvariantViolation);
    expect(await db.select().from(waitlistEntries)).toHaveLength(0); // the insert was rolled back
  });
});
