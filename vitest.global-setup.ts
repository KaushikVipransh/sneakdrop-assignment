import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

/** Brings the test database up to the latest migration once per test run. */
export default async function setup() {
  config({ quiet: true });
  const url =
    process.env.DATABASE_URL_TEST ?? "postgres://sneakdrop:sneakdrop@localhost:5432/sneakdrop_test";
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  } finally {
    await pool.end();
  }
}
