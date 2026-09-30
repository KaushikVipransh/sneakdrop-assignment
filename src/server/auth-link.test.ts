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
    const active = await db.select().from(holds);
    expect(active.map((h) => h.userId).sort()).toEqual(["guest", "member"]);
  });
});
