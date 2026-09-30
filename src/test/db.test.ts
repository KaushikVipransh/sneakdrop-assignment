import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { drops } from "@/server/db/schema";
import { countAllRows, resetDb } from "./db";

describe("test database harness", () => {
  beforeEach(resetDb);
  afterAll(resetDb);

  it("uses the dedicated test database", () => {
    expect(process.env.DATABASE_URL).toMatch(/sneakdrop_test/);
  });

  it("writes a row and resetDb removes it", async () => {
    await db.insert(drops).values({ name: "t", totalStock: 20, startsAt: new Date() });
    expect(await countAllRows()).toBe(1);
    await resetDb();
    expect(await countAllRows()).toBe(0);
  });
});
