import { sql } from "drizzle-orm";
import type { Db } from "./client";
import { drops } from "./schema";

export const DEFAULT_DROP = {
  name: 'Air Timebase 01 — "Zero Oversell"',
  totalStock: 20,
  holdSeconds: 300,
  maxPerUser: 2,
} as const;

/** Creates the drop if none exists. Safe to run repeatedly. */
export async function seed(db: Db): Promise<void> {
  const existing = await db.select({ id: drops.id }).from(drops).limit(1);
  if (existing.length === 0) {
    await db.insert(drops).values({ ...DEFAULT_DROP, startsAt: new Date() });
  }
}

/** Deletes all drop state (not users or sessions) and seeds a fresh drop. */
export async function resetAndSeed(db: Db): Promise<void> {
  const { rows } = await db.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public'`,
  );
  const keep = new Set(["user", "session", "account", "verification"]);
  const tables = rows.map((r) => r.tablename).filter((t) => !keep.has(t));
  if (tables.length > 0) {
    const list = tables.map((t) => `"public"."${t}"`).join(", ");
    await db.execute(sql.raw(`truncate table ${list} restart identity cascade`));
  }
  await seed(db);
}
