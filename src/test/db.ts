import { sql } from "drizzle-orm";
import { db } from "@/server/db/client";

/** Empties every application table. Call in `beforeEach` of DB-backed tests. */
export async function resetDb(): Promise<void> {
  const { rows } = await db.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public'`,
  );
  if (rows.length === 0) return;
  const list = rows.map((r) => `"public"."${r.tablename}"`).join(", ");
  await db.execute(sql.raw(`truncate table ${list} restart identity cascade`));
}

/** Total row count across all application tables; used to prove tests clean up. */
export async function countAllRows(): Promise<number> {
  const { rows } = await db.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public'`,
  );
  let total = 0;
  for (const { tablename } of rows) {
    const result = await db.execute<{ n: number }>(
      sql.raw(`select count(*)::int as n from "public"."${tablename}"`),
    );
    total += result.rows[0]?.n ?? 0;
  }
  return total;
}
