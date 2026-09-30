import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { adminStateSchema } from "@/lib/admin-state";
import { db } from "@/server/db/client";
import { fakepaySettings } from "@/server/db/schema";
import { applyPaymentEvent } from "@/server/drop/webhook";
import { startPayment } from "@/server/drop/payments";
import { joinWaitlist } from "@/server/drop/waitlist";
import { adminCookie } from "@/test/admin";
import { guestCookie } from "@/test/auth";
import { createDrop, insertHold } from "@/test/factories";
import { resetDb } from "@/test/db";
import { GET } from "./route";

const req = (cookie?: string) =>
  new Request("http://localhost/api/admin/state", { headers: cookie ? { cookie } : {} });

describe("GET /api/admin/state", () => {
  beforeEach(resetDb);
  afterAll(resetDb);

  it("401 without a session, 403 for a non-admin", async () => {
    expect((await GET(req())).status).toBe(401);
    const { cookie } = await guestCookie();
    expect((await GET(req(cookie))).status).toBe(403);
  });

  it("returns counts, invariant, holds, queue, webhooks, and chaos", async () => {
    await db.insert(fakepaySettings).values({ id: 1, duplicateRate: 0.3 });
    const drop = await createDrop({ totalStock: 2 });
    const paid = await insertHold(drop, "payer");
    await insertHold(drop, "holder");
    await joinWaitlist("waiter", drop.id);
    const started = await startPayment("payer", paid.id);
    if (started.code !== "STARTED") throw new Error(started.code);
    const event = {
      id: "evt_admin_1",
      type: "payment.succeeded" as const,
      created_at: new Date().toISOString(),
      data: { intent_id: started.intent.id, hold_id: paid.id, amount: 1 },
    };
    await applyPaymentEvent(event);
    await applyPaymentEvent(event);

    const response = await GET(req(await adminCookie()));
    expect(response.status).toBe(200);
    const state = adminStateSchema.parse(await response.json());

    expect(state.drop).toMatchObject({
      total: 2,
      sold: 1,
      held: 1,
      available: 0,
      waitlistLength: 1,
      refunds: 0,
      invariant: { ok: true },
    });
    expect(state.activeHolds).toMatchObject([{ userId: "holder", source: "buy" }]);
    expect(state.waitlist).toMatchObject([{ position: 1, userId: "waiter" }]);
    expect(state.webhooks.map((w) => w.outcome)).toEqual(["duplicate", "order_created"]);
    expect(state.chaos.duplicateRate).toBeCloseTo(0.3);
  });
});
