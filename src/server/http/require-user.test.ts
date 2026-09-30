import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { guestCookie } from "@/test/auth";
import { resetDb } from "@/test/db";
import { requireUser } from "./require-user";

describe("requireUser", () => {
  beforeEach(resetDb);
  afterAll(resetDb);

  it("returns a 401 response without a session", async () => {
    const result = await requireUser(new Request("http://localhost/api/x"));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(401);
    expect(await result.response.json()).toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("returns the signed-in user", async () => {
    const { cookie, userId } = await guestCookie();
    const result = await requireUser(
      new Request("http://localhost/api/x", { headers: { cookie } }),
    );
    expect(result).toMatchObject({ ok: true, user: { id: userId, isAnonymous: true } });
  });
});
