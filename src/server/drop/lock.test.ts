import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { withTx } from "@/server/db/client";
import { createDrop } from "@/test/factories";
import { resetDb } from "@/test/db";
import { DropNotFound } from "./errors";
import { lockDrop } from "./lock";

describe("lockDrop", () => {
  beforeEach(resetDb);
  afterAll(resetDb);

  it("returns the drop row", async () => {
    const drop = await createDrop({ totalStock: 7 });
    const locked = await withTx((tx) => lockDrop(tx, drop.id));
    expect(locked).toMatchObject({ id: drop.id, totalStock: 7 });
  });

  it("throws DropNotFound for an unknown id", async () => {
    await expect(
      withTx((tx) => lockDrop(tx, "00000000-0000-0000-0000-000000000000")),
    ).rejects.toBeInstanceOf(DropNotFound);
  });

  it("blocks a second transaction until the first commits", async () => {
    const drop = await createDrop();
    const order: string[] = [];
    let releaseFirst!: () => void;
    const firstHasLock = new Promise<void>((resolve) => {
      const first = withTx(async (tx) => {
        await lockDrop(tx, drop.id);
        order.push("first locked");
        resolve();
        await new Promise<void>((r) => (releaseFirst = r));
        order.push("first commits");
      });
      void first;
    });
    await firstHasLock;
    const second = withTx(async (tx) => {
      await lockDrop(tx, drop.id);
      order.push("second locked");
    });
    await new Promise((r) => setTimeout(r, 100));
    releaseFirst();
    await second;
    expect(order).toEqual(["first locked", "first commits", "second locked"]);
  });
});
