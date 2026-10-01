/**
 * Helpers for a live demo or the screen recording (local database only).
 *
 *   pnpm demo stock <n>      set the current drop's total stock (e.g. 1 to show "sold out")
 *   pnpm demo fast-forward   make every active hold expire now and every scheduled
 *                            webhook due now (skips the 5-minute wait)
 */
import "dotenv/config";
import { Client } from "pg";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set; see .env.example");
  const host = new URL(url).hostname;
  if (!["localhost", "127.0.0.1"].includes(host) && !process.argv.includes("--force")) {
    throw new Error(`refusing to touch ${host}; this helper is for the local database`);
  }

  const [command, value] = process.argv.slice(2);
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    if (command === "stock") {
      const n = Number(value);
      if (!Number.isInteger(n) || n < 1) throw new Error("usage: pnpm demo stock <n>");
      await client.query(
        `update drops set total_stock = $1
         where id = (select id from drops order by created_at desc limit 1)`,
        [n],
      );
      console.log(`total stock is now ${n}`);
    } else if (command === "fast-forward") {
      const holds = await client.query(
        `update holds set expires_at = now() where status = 'ACTIVE'`,
      );
      const deliveries = await client.query(
        `update fakepay_deliveries set deliver_at = now() where status = 'PENDING'`,
      );
      console.log(
        `${holds.rowCount} hold(s) expire now, ${deliveries.rowCount} webhook(s) due now`,
      );
    } else {
      console.log("usage: pnpm demo stock <n> | pnpm demo fast-forward");
    }
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
