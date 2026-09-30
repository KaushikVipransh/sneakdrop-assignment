import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { holds } from "@/server/db/schema";
import { createDrop, insertHold, insertWaiting } from "@/test/factories";
import { resetDb } from "@/test/db";
import { GET, POST } from "./route";

const secret = process.env.CRON_SECRET!;
const req = (headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/cron/reconcile", { method: "POST", headers });

describe("/api/cron/reconcile", () => {
  beforeEach(resetDb);
  afterAll(resetDb);

  it("401 without the secret or with a wrong one", async () => {
    await createDrop();
    expect((await POST(req())).status).toBe(401);
    expect((await POST(req({ authorization: "Bearer wrong-secret-value" }))).status).toBe(401);
  });

  it("expires due holds and promotes waiters with nobody polling", async () => {
    const drop = await createDrop({ totalStock: 1 });
    const hold = await insertHold(drop, "a", { expiresAt: new Date(Date.now() - 1000) });
    await insertWaiting(drop, "b");

    const response = await POST(req({ authorization: `Bearer ${secret}` }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, expired: 1, promoted: 1 });

    const [expired] = await db.select().from(holds).where(eq(holds.id, hold.id));
    expect(expired!.status).toBe("EXPIRED");
    const [promoted] = await db.select().from(holds).where(eq(holds.userId, "b"));
    expect(promoted).toMatchObject({ status: "ACTIVE", source: "waitlist" });
  });

  it("also accepts GET (Vercel Cron style)", async () => {
    await createDrop();
    const response = await GET(
      new Request("http://localhost/api/cron/reconcile", {
        headers: { authorization: `Bearer ${secret}` },
      }),
    );
    expect(response.status).toBe(200);
  });
});
