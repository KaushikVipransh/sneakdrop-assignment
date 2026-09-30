import "dotenv/config";
import { sql } from "drizzle-orm";

async function main() {
  const { db, pool } = await import("../src/server/db/client");
  const result = await db.execute<{ ok: number }>(sql`select 1 as ok`);
  console.log(`select 1 → ${result.rows[0]?.ok}`);
  await pool.end();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
