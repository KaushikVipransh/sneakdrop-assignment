import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { drops, fakepayDeliveries, fakepaySettings, holds, orders } from "@/server/db/schema";
import { startPayment } from "@/server/drop/payments";
import { adminCookie } from "@/test/admin";
import { guestCookie } from "@/test/auth";
import { createDrop, insertHold, insertOrder } from "@/test/factories";
import { resetDb } from "@/test/db";
import { PUT as putChaos } from "./chaos/route";
import { POST as reset } from "./reset/route";

const chaosReq = (body: unknown, cookie?: string) =>
  new Request("http://localhost/api/admin/chaos", {
    method: "PUT",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });

const chaos = {
  minDelayMs: 1000,
  maxDelayMs: 420_000,
  duplicateRate: 0,
  reorderRate: 0,
  failRate: 1,
};

describe("admin controls", () => {
  beforeEach(resetDb);
  afterAll(resetDb);

  it("chaos: 403 for non-admins, 400 for bad input", async () => {
    const { cookie } = await guestCookie();
    expect((await putChaos(chaosReq(chaos, cookie))).status).toBe(403);
    const admin = await adminCookie();
    expect((await putChaos(chaosReq({ ...chaos, failRate: 2 }, admin))).status).toBe(400);
    expect(
      (await putChaos(chaosReq({ ...chaos, minDelayMs: 9e5, maxDelayMs: 1 }, admin))).status,
    ).toBe(400);
  });

  it("chaos: new settings change the deliveries the provider schedules", async () => {
    const response = await putChaos(chaosReq(chaos, await adminCookie()));
    expect(response.status).toBe(200);
    const [settings] = await db.select().from(fakepaySettings);
    expect(settings).toMatchObject({ failRate: 1, minDelayMs: 1000, maxDelayMs: 420_000 });

    const drop = await createDrop();
    const hold = await insertHold(drop, "u1");
    await startPayment("u1", hold.id);
    const [delivery] = await db.select().from(fakepayDeliveries);
    expect(delivery!.type).toBe("payment.failed");
    expect(delivery!.deliverAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("reset: clears drop state, keeps chaos settings, seeds a fresh drop", async () => {
    await db.insert(fakepaySettings).values({ id: 1, duplicateRate: 0.5 });
    const drop = await createDrop();
    await insertOrder(drop, "a");
    await insertHold(drop, "b");
    const { cookie } = await guestCookie();
    expect(
      (
        await reset(
          new Request("http://localhost/api/admin/reset", { method: "POST", headers: { cookie } }),
        )
      ).status,
    ).toBe(403);

    const response = await reset(
      new Request("http://localhost/api/admin/reset", {
        method: "POST",
        headers: { cookie: await adminCookie() },
      }),
    );
    expect(response.status).toBe(200);
    expect(await db.select().from(orders)).toHaveLength(0);
    expect(await db.select().from(holds)).toHaveLength(0);
    const fresh = await db.select().from(drops);
    expect(fresh).toHaveLength(1);
    expect(fresh[0]!.totalStock).toBe(20);
    const [settings] = await db.select().from(fakepaySettings);
    expect(settings!.duplicateRate).toBeCloseTo(0.5);
  });
});
