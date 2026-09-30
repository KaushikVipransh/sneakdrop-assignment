import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/webhooks/payments/route";
import { db } from "@/server/db/client";
import { fakepayDeliveries, orders } from "@/server/db/schema";
import { startPayment } from "@/server/drop/payments";
import { createDrop, insertHold } from "@/test/factories";
import { resetDb } from "@/test/db";
import { serveHandler } from "@/test/http-server";
import { dispatchDue, MAX_ATTEMPTS } from "./dispatcher";

async function pendingPayment() {
  const drop = await createDrop();
  const hold = await insertHold(drop, "u1");
  const started = await startPayment("u1", hold.id);
  if (started.code !== "STARTED") throw new Error(started.code);
  return started.intent;
}

describe("fakepay dispatcher", () => {
  beforeEach(resetDb);
  afterAll(resetDb);

  it("POSTs a due delivery to the webhook over HTTP and marks it DELIVERED", async () => {
    const server = await serveHandler(POST);
    try {
      await pendingPayment();
      const result = await dispatchDue({
        limit: 10,
        webhookUrl: `${server.url}/api/webhooks/payments`,
      });
      expect(result).toMatchObject({ claimed: 1, delivered: 1, failed: 0 });
      expect(server.hits()).toBe(1);
      const [delivery] = await db.select().from(fakepayDeliveries);
      expect(delivery).toMatchObject({ status: "DELIVERED", attempts: 1 });
      expect(await db.select().from(orders)).toHaveLength(1);
    } finally {
      await server.close();
    }
  });

  it("leaves deliveries that are not due yet", async () => {
    await pendingPayment();
    await db.update(fakepayDeliveries).set({ deliverAt: new Date(Date.now() + 60_000) });
    const result = await dispatchDue({ limit: 10, webhookUrl: "http://127.0.0.1:1/unused" });
    expect(result.claimed).toBe(0);
  });

  it("retries with backoff on failure and gives up after the max attempts", async () => {
    const server = await serveHandler(async () => new Response("boom", { status: 500 }));
    try {
      await pendingPayment();
      const url = `${server.url}/hook`;
      let now = new Date();
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const result = await dispatchDue({ limit: 10, webhookUrl: url, now });
        expect(result.claimed).toBe(1);
        const [d] = await db.select().from(fakepayDeliveries);
        expect(d!.attempts).toBe(attempt);
        expect(d!.lastError).toMatch(/500/);
        if (attempt < MAX_ATTEMPTS) {
          expect(d!.status).toBe("PENDING");
          expect(d!.deliverAt.getTime()).toBeGreaterThan(now.getTime());
          now = new Date(d!.deliverAt.getTime() + 1);
        } else {
          expect(d!.status).toBe("DEAD");
        }
      }
      expect(server.hits()).toBe(MAX_ATTEMPTS);
    } finally {
      await server.close();
    }
  });

  it("never sends one delivery twice when dispatchers run in parallel", async () => {
    const server = await serveHandler(POST);
    try {
      await pendingPayment();
      const url = `${server.url}/api/webhooks/payments`;
      const results = await Promise.all(
        [1, 2, 3, 4].map(() => dispatchDue({ limit: 10, webhookUrl: url })),
      );
      expect(results.reduce((n, r) => n + r.claimed, 0)).toBe(1);
      expect(server.hits()).toBe(1);
      const rows = await db
        .select()
        .from(fakepayDeliveries)
        .where(eq(fakepayDeliveries.status, "DELIVERED"));
      expect(rows).toHaveLength(1);
    } finally {
      await server.close();
    }
  });
});
