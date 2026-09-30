/**
 * Applies SQL migrations from ./drizzle.
 * Usage: pnpm db:migrate          (DATABASE_URL_DIRECT, else DATABASE_URL)
 *        pnpm db:migrate --test   (DATABASE_URL_TEST)
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

async function main() {
  const url = process.argv.includes("--test")
    ? process.env.DATABASE_URL_TEST
    : (process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL);
  if (!url) throw new Error("No database URL set; see .env.example");

  const pool = new Pool({ connectionString: url, max: 1 });
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  await pool.end();
  console.log(`migrations applied to ${new URL(url).pathname.slice(1)}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
