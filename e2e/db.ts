import { config } from "dotenv";
import { Client } from "pg";

config({ quiet: true });

/** Runs SQL against the app's database (the dev DB from .env). */
export async function sql(query: string, params: unknown[] = []): Promise<void> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(query, params);
  } finally {
    await client.end();
  }
}

/** Clears drop state (keeps chaos settings) and sets the stock for the next test. */
export async function resetDrop(totalStock = 20): Promise<void> {
  await sql(`
    truncate table audit_log, fakepay_deliveries, webhook_events, payment_intents,
      waitlist_entries, orders, holds, drops restart identity cascade
  `);
  await sql(
    `insert into drops (name, total_stock, starts_at) values ($1, $2, now() - interval '1 minute')`,
    ['Air Timebase 01 — "Zero Oversell"', totalStock],
  );
  await sql(
    `insert into fakepay_settings (id) values (1)
     on conflict (id) do update set min_delay_ms = 0, max_delay_ms = 0,
       duplicate_rate = 0, reorder_rate = 0, fail_rate = 0`,
  );
}
