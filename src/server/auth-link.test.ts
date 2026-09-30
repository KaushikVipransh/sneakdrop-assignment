import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { holds, orders, waitlistEntries } from "@/server/db/schema";
import { createDrop, insertHold, insertOrder, insertWaiting } from "@/test/factories";
import { resetDb } from "@/test/db";
import { transferGuestActivity } from "./auth-link";

describe("transferGuestActivity", () => {
  beforeEach(resetDb);
  afterAll(resetDb);

  it("moves a guest's holds, orders, and waitlist entries to the email account", async () => {
    const drop = await createDrop();
    await insertOrder(drop, "guest");
    await insertHold(drop, "guest");
    await insertWaiting(drop, "guest");
    await transferGuestActivity("guest", "member");
    const owners = [
      ...(await db.select({ u: holds.userId }).from(holds)),
      ...(await db.select({ u: orders.userId }).from(orders)),
      ...(await db.select({ u: waitlistEntries.userId }).from(waitlistEntries)),
    ].map((r) => r.u);
    expect(new Set(owners)).toEqual(new Set(["member"]));
  });

  it("leaves both histories alone if the email account already took part", async () => {
    const drop = await createDrop();
    await insertHold(drop, "guest");
    await insertOrder(drop, "member");
    await transferGuestActivity("guest", "member");
    const rows = await db.select().from(holds);
    expect(rows.map((h) => h.userId).sort()).toEqual(["guest", "member"]);
  });

  it("frees what the deleted guest was holding or waiting for, when not merging", async () => {
    // Guest holds the only pair; someone else waits; the member already bought.
    const drop = await createDrop({ totalStock: 2 });
    await insertOrder(drop, "member");
    const guestHold = await insertHold(drop, "guest");
    await insertWaiting(drop, "next");
    await insertWaiting(drop, "guest-too", new Date(Date.now() + 1000));
    await db
      .update(waitlistEntries)
      .set({ userId: "guest" })
      .where(eq(waitlistEntries.userId, "guest-too"));

    await transferGuestActivity("guest", "member");

    const [released] = await db.select().from(holds).where(eq(holds.id, guestHold.id));
    expect(released!.status).toBe("RELEASED");
    const [promoted] = await db
      .select()
      .from(holds)
      .where(and(eq(holds.userId, "next"), eq(holds.status, "ACTIVE")));
    expect(promoted).toBeDefined();
    const guestEntries = await db
      .select()
      .from(waitlistEntries)
      .where(eq(waitlistEntries.userId, "guest"));
    expect(guestEntries.map((e) => e.status)).toEqual(["LEFT"]);
  });
});
