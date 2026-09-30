import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { dropStatusSchema } from "@/lib/status";
import { db } from "@/server/db/client";
import { holds } from "@/server/db/schema";
import { createHold } from "@/server/drop/holds";
import { joinWaitlist } from "@/server/drop/waitlist";
import { guestCookie } from "@/test/auth";
import { createDrop, insertHold, insertOrder } from "@/test/factories";
import { resetDb } from "@/test/db";
import { GET } from "./route";

async function status(cookie?: string) {
  const response = await GET(
    new Request("http://localhost/api/drop/status", { headers: cookie ? { cookie } : {} }),
  );
  expect(response.status).toBe(200);
  return dropStatusSchema.parse(await response.json());
}

describe("GET /api/drop/status", () => {
  beforeEach(resetDb);
  afterAll(resetDb);

  it("404 without a drop", async () => {
    const response = await GET(new Request("http://localhost/api/drop/status"));
    expect(response.status).toBe(404);
  });

  it("returns counts and no `me` for an anonymous visitor", async () => {
    const drop = await createDrop({ totalStock: 20 });
    await insertOrder(drop, "a");
    await insertHold(drop, "b");
    const s = await status();
    expect(s.drop).toMatchObject({ total: 20, sold: 1, held: 1, available: 18, waitlistLength: 0 });
    expect(s.me).toBeNull();
    expect(Math.abs(Date.parse(s.serverTime) - Date.now())).toBeLessThan(5000);
  });

  it("shows the user's hold, purchases, and receipt", async () => {
    const drop = await createDrop();
    const { cookie, userId } = await guestCookie();
    await insertOrder(drop, userId);
    const created = await createHold(userId, drop.id);
    if (created.code !== "HOLD_CREATED") throw new Error(created.code);

    const s = await status(cookie);
    expect(s.me).toMatchObject({
      userId,
      isGuest: true,
      hold: { id: created.hold.id, status: "ACTIVE", source: "buy" },
      latestHold: { id: created.hold.id },
      purchased: 1,
      limit: 2,
      waitlistPosition: null,
      payment: null,
    });
    expect(s.me!.events.at(-1)).toMatchObject({ entity: "hold", to: "ACTIVE" });
  });

  it("shows the waitlist position", async () => {
    const drop = await createDrop({ totalStock: 1 });
    await insertHold(drop, "someone");
    const { cookie, userId } = await guestCookie();
    await joinWaitlist("first", drop.id);
    await joinWaitlist(userId, drop.id);
    const s = await status(cookie);
    expect(s.drop.waitlistLength).toBe(2);
    expect(s.me!.waitlistPosition).toBe(2);
  });

  it("expires due holds and promotes the next waiter when polled", async () => {
    const drop = await createDrop({ totalStock: 1 });
    const hold = await insertHold(drop, "someone");
    const { cookie, userId } = await guestCookie();
    await joinWaitlist(userId, drop.id);
    await db
      .update(holds)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(holds.id, hold.id));

    const s = await status(cookie);
    expect(s.me).toMatchObject({ hold: { source: "waitlist" }, waitlistPosition: null });
    expect(s.drop).toMatchObject({ held: 1, available: 0, waitlistLength: 0 });
  });
});
