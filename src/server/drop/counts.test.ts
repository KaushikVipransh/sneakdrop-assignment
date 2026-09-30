import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { withTx } from "@/server/db/client";
import { createDrop, insertHold, insertOrder } from "@/test/factories";
import { resetDb } from "@/test/db";
import { getCounts } from "./counts";

describe("getCounts", () => {
  beforeEach(resetDb);
  afterAll(resetDb);

  it("derives stock from order and active hold rows", async () => {
    const drop = await createDrop({ totalStock: 20 });
    const other = await createDrop();
    await insertOrder(drop, "a");
    await insertOrder(drop, "b");
    await insertHold(drop, "c");
    await insertHold(drop, "d");
    await insertHold(drop, "e");
    // Terminal holds and other drops do not count.
    await insertHold(drop, "f", { status: "EXPIRED", endedAt: new Date() });
    await insertHold(drop, "g", { status: "RELEASED", endedAt: new Date() });
    await insertHold(other, "h");

    const counts = await withTx((tx) => getCounts(tx, drop.id));
    expect(counts).toEqual({ total: 20, sold: 2, held: 3, available: 15 });
  });

  it("returns full stock for an empty drop", async () => {
    const drop = await createDrop({ totalStock: 5 });
    expect(await withTx((tx) => getCounts(tx, drop.id))).toEqual({
      total: 5,
      sold: 0,
      held: 0,
      available: 5,
    });
  });
});
