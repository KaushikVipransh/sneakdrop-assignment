import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { drops, holds, orders } from "@/server/db/schema";
import { resetDb } from "@/test/db";

async function seedDrop() {
  const [drop] = await db
    .insert(drops)
    .values({ name: "t", totalStock: 20, startsAt: new Date() })
    .returning();
  return drop!;
}

const inFiveMinutes = () => new Date(Date.now() + 300_000);

describe("holds table", () => {
  beforeEach(resetDb);
  afterAll(resetDb);

  it("rejects a second ACTIVE hold for the same user and drop", async () => {
    const drop = await seedDrop();
    await db.insert(holds).values({ dropId: drop.id, userId: "u1", expiresAt: inFiveMinutes() });
    await expect(
      db.insert(holds).values({ dropId: drop.id, userId: "u1", expiresAt: inFiveMinutes() }),
    ).rejects.toMatchObject({ cause: { code: "23505" } });
  });

  it("allows a new ACTIVE hold once the old one is terminal", async () => {
    const drop = await seedDrop();
    await db.insert(holds).values({
      dropId: drop.id,
      userId: "u1",
      status: "EXPIRED",
      expiresAt: new Date(),
      endedAt: new Date(),
    });
    await db.insert(holds).values({ dropId: drop.id, userId: "u1", expiresAt: inFiveMinutes() });
    const rows = await db.select().from(holds);
    expect(rows).toHaveLength(2);
    expect(rows.find((h) => h.status === "ACTIVE")?.source).toBe("buy");
  });
});

describe("orders table", () => {
  beforeEach(resetDb);
  afterAll(resetDb);

  it("rejects a second order for the same hold", async () => {
    const drop = await seedDrop();
    const [hold] = await db
      .insert(holds)
      .values({ dropId: drop.id, userId: "u1", expiresAt: inFiveMinutes() })
      .returning();
    await db.insert(orders).values({ dropId: drop.id, userId: "u1", holdId: hold!.id });
    await expect(
      db.insert(orders).values({ dropId: drop.id, userId: "u1", holdId: hold!.id }),
    ).rejects.toMatchObject({ cause: { code: "23505" } });
  });
});
