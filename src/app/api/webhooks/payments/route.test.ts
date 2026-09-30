import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { orders } from "@/server/db/schema";
import { startPayment } from "@/server/drop/payments";
import { SIGNATURE_HEADER, sign } from "@/server/fakepay/signature";
import { createDrop, insertHold } from "@/test/factories";
import { resetDb } from "@/test/db";
import { POST } from "./route";

const secret = process.env.WEBHOOK_SECRET!;

function request(body: string, signature?: string) {
  return new Request("http://localhost/api/webhooks/payments", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(signature ? { [SIGNATURE_HEADER]: signature } : {}),
    },
    body,
  });
}

async function successEvent() {
  const drop = await createDrop();
  const hold = await insertHold(drop, "u1");
  const started = await startPayment("u1", hold.id);
  if (started.code !== "STARTED") throw new Error(started.code);
  return JSON.stringify({
    id: "evt_route_1",
    type: "payment.succeeded",
    created_at: new Date().toISOString(),
    data: { intent_id: started.intent.id, hold_id: hold.id, amount: started.intent.amount },
  });
}

describe("POST /api/webhooks/payments", () => {
  beforeEach(resetDb);
  afterAll(resetDb);

  it("rejects a missing or bad signature with 401", async () => {
    const body = await successEvent();
    expect((await POST(request(body))).status).toBe(401);
    expect((await POST(request(body, sign(body, "wrong-secret-0123456789")))).status).toBe(401);
    expect(await db.select().from(orders)).toHaveLength(0);
  });

  it("rejects a signed but malformed body with 400", async () => {
    const body = JSON.stringify({ hello: "world" });
    expect((await POST(request(body, sign(body, secret)))).status).toBe(400);
  });

  it("processes a valid event with 200", async () => {
    const body = await successEvent();
    const response = await POST(request(body, sign(body, secret)));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, result: "order_created" });
    expect(await db.select().from(orders)).toHaveLength(1);
  });

  it("acknowledges a duplicate with 200", async () => {
    const body = await successEvent();
    await POST(request(body, sign(body, secret)));
    const response = await POST(request(body, sign(body, secret)));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, result: "duplicate" });
    expect(await db.select().from(orders)).toHaveLength(1);
  });

  it("asks the provider to retry an event for an unknown intent", async () => {
    const body = JSON.stringify({
      id: "evt_unknown",
      type: "payment.succeeded",
      created_at: new Date().toISOString(),
      data: { intent_id: "00000000-0000-0000-0000-000000000000", hold_id: "h", amount: 1 },
    });
    expect((await POST(request(body, sign(body, secret)))).status).toBe(409);
  });
});
