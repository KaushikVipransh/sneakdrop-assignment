import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createDrop, insertHold, insertOrder } from "@/test/factories";
import { guestCookie } from "@/test/auth";
import { resetDb } from "@/test/db";
import { POST as buy } from "./drop/hold/route";
import { DELETE as leave, POST as join } from "./drop/waitlist/route";
import { POST as pay } from "./holds/[id]/pay/route";
import { POST as release } from "./holds/[id]/release/route";

function req(path: string, cookie?: string, method = "POST") {
  return new Request(`http://localhost${path}`, {
    method,
    headers: cookie ? { cookie } : {},
  });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });

async function call(response: Promise<Response> | Response) {
  const r = await response;
  return { status: r.status, body: (await r.json()) as Record<string, unknown> };
}

describe("mutation routes", () => {
  beforeEach(resetDb);
  afterAll(resetDb);

  it("401 without a session", async () => {
    await createDrop();
    for (const res of [
      buy(req("/api/drop/hold")),
      join(req("/api/drop/waitlist")),
      leave(req("/api/drop/waitlist", undefined, "DELETE")),
      pay(req("/api/holds/x/pay"), params("x")),
      release(req("/api/holds/x/release"), params("x")),
    ]) {
      expect(await call(res)).toMatchObject({ status: 401, body: { code: "UNAUTHENTICATED" } });
    }
  });

  it("404 when there is no drop", async () => {
    const { cookie } = await guestCookie();
    expect(await call(buy(req("/api/drop/hold", cookie)))).toMatchObject({
      status: 404,
      body: { code: "NO_DROP" },
    });
  });

  describe("POST /api/drop/hold", () => {
    it("200 HOLD_CREATED, then 200 ALREADY_HOLDING", async () => {
      await createDrop();
      const { cookie } = await guestCookie();
      const first = await call(buy(req("/api/drop/hold", cookie)));
      expect(first).toMatchObject({
        status: 200,
        body: { code: "HOLD_CREATED", hold: { status: "ACTIVE" } },
      });
      expect(await call(buy(req("/api/drop/hold", cookie)))).toMatchObject({
        status: 200,
        body: { code: "ALREADY_HOLDING" },
      });
    });

    it("409 SOLD_OUT", async () => {
      const drop = await createDrop({ totalStock: 1 });
      await insertHold(drop, "someone");
      const { cookie } = await guestCookie();
      expect(await call(buy(req("/api/drop/hold", cookie)))).toMatchObject({
        status: 409,
        body: { code: "SOLD_OUT", canJoinWaitlist: true },
      });
    });

    it("403 LIMIT_REACHED", async () => {
      const drop = await createDrop();
      const { cookie, userId } = await guestCookie();
      await insertOrder(drop, userId);
      await insertOrder(drop, userId);
      expect(await call(buy(req("/api/drop/hold", cookie)))).toMatchObject({
        status: 403,
        body: { code: "LIMIT_REACHED", message: "Purchase limit reached (2 pairs)." },
      });
    });

    it("409 NOT_STARTED", async () => {
      await createDrop({ startsAt: new Date(Date.now() + 60_000) });
      const { cookie } = await guestCookie();
      expect(await call(buy(req("/api/drop/hold", cookie)))).toMatchObject({
        status: 409,
        body: { code: "NOT_STARTED" },
      });
    });
  });

  describe("hold actions", () => {
    it("pay: 200 STARTED, 200 ALREADY_PENDING, 404 for another user's hold, 409 when ended", async () => {
      const drop = await createDrop();
      const { cookie, userId } = await guestCookie();
      const hold = await insertHold(drop, userId);
      const path = `/api/holds/${hold.id}/pay`;
      expect(await call(pay(req(path, cookie), params(hold.id)))).toMatchObject({
        status: 200,
        body: { code: "STARTED", intent: { status: "PENDING" } },
      });
      expect(await call(pay(req(path, cookie), params(hold.id)))).toMatchObject({
        status: 200,
        body: { code: "ALREADY_PENDING" },
      });
      const other = await guestCookie();
      expect(await call(pay(req(path, other.cookie), params(hold.id)))).toMatchObject({
        status: 404,
        body: { code: "NOT_FOUND" },
      });
      const ended = await insertHold(drop, other.userId, {
        status: "EXPIRED",
        endedAt: new Date(),
      });
      expect(
        await call(pay(req(`/api/holds/${ended.id}/pay`, other.cookie), params(ended.id))),
      ).toMatchObject({ status: 409, body: { code: "NOT_ACTIVE", status: "EXPIRED" } });
    });

    it("release: 200 RELEASED, then 409 NOT_ACTIVE, 404 unknown", async () => {
      const drop = await createDrop();
      const { cookie, userId } = await guestCookie();
      const hold = await insertHold(drop, userId);
      const path = `/api/holds/${hold.id}/release`;
      expect(await call(release(req(path, cookie), params(hold.id)))).toMatchObject({
        status: 200,
        body: { code: "RELEASED" },
      });
      expect(await call(release(req(path, cookie), params(hold.id)))).toMatchObject({
        status: 409,
        body: { code: "NOT_ACTIVE" },
      });
      expect(
        await call(release(req("/api/holds/nope/release", cookie), params("nope"))),
      ).toMatchObject({
        status: 404,
      });
    });
  });

  describe("waitlist", () => {
    it("join 200 with position, idempotent, leave 200 then 404", async () => {
      const drop = await createDrop({ totalStock: 1 });
      await insertHold(drop, "someone");
      const { cookie } = await guestCookie();
      expect(await call(join(req("/api/drop/waitlist", cookie)))).toMatchObject({
        status: 200,
        body: { code: "JOINED", position: 1 },
      });
      expect(await call(join(req("/api/drop/waitlist", cookie)))).toMatchObject({
        status: 200,
        body: { code: "ALREADY_WAITING", position: 1 },
      });
      expect(await call(leave(req("/api/drop/waitlist", cookie, "DELETE")))).toMatchObject({
        status: 200,
        body: { code: "LEFT" },
      });
      expect(await call(leave(req("/api/drop/waitlist", cookie, "DELETE")))).toMatchObject({
        status: 404,
        body: { code: "NOT_WAITING" },
      });
    });

    it("join 409 while stock is available or while holding; 403 at the limit", async () => {
      const drop = await createDrop({ totalStock: 3 });
      const a = await guestCookie();
      const b = await guestCookie();
      expect(await call(join(req("/api/drop/waitlist", a.cookie)))).toMatchObject({
        status: 409,
        body: { code: "STOCK_AVAILABLE" },
      });
      // Sell out: a holds one pair, b owns the other two.
      await insertHold(drop, a.userId);
      await insertOrder(drop, b.userId);
      await insertOrder(drop, b.userId);
      expect(await call(join(req("/api/drop/waitlist", a.cookie)))).toMatchObject({
        status: 409,
        body: { code: "ALREADY_HOLDING" },
      });
      expect(await call(join(req("/api/drop/waitlist", b.cookie)))).toMatchObject({
        status: 403,
        body: { code: "LIMIT_REACHED" },
      });
    });
  });
});
