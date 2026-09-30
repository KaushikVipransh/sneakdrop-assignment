import { db } from "@/server/db/client";
import { drops, holds, orders, waitlistEntries, type Drop, type Hold } from "@/server/db/schema";

export async function createDrop(
  overrides: Partial<typeof drops.$inferInsert> = {},
): Promise<Drop> {
  const [drop] = await db
    .insert(drops)
    .values({
      name: "Test drop",
      totalStock: 20,
      startsAt: new Date(Date.now() - 60_000),
      ...overrides,
    })
    .returning();
  return drop!;
}

export async function insertHold(
  drop: Drop,
  userId: string,
  overrides: Partial<typeof holds.$inferInsert> = {},
): Promise<Hold> {
  const [hold] = await db
    .insert(holds)
    .values({
      dropId: drop.id,
      userId,
      expiresAt: new Date(Date.now() + drop.holdSeconds * 1000),
      ...overrides,
    })
    .returning();
  return hold!;
}

/** Inserts a CONVERTED hold and its order, as if the user had paid. */
export async function insertOrder(drop: Drop, userId: string) {
  const hold = await insertHold(drop, userId, { status: "CONVERTED", endedAt: new Date() });
  const [order] = await db
    .insert(orders)
    .values({ dropId: drop.id, userId, holdId: hold.id })
    .returning();
  return order!;
}

/** Inserts a WAITING waitlist entry; pass increasing `createdAt` to fix queue order. */
export async function insertWaiting(drop: Drop, userId: string, createdAt = new Date()) {
  const [entry] = await db
    .insert(waitlistEntries)
    .values({ dropId: drop.id, userId, createdAt })
    .returning();
  return entry!;
}
