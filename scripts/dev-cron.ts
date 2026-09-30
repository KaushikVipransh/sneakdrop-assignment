/**
 * Local stand-in for the production scheduler: calls the cron endpoint every
 * 10 seconds while `pnpm dev` runs. Usage: pnpm dev:cron
 */
import "dotenv/config";

const base = process.env.APP_URL ?? "http://localhost:3000";
const secret = process.env.CRON_SECRET;
const intervalMs = Number(process.env.DEV_CRON_INTERVAL_MS ?? 10_000);

if (!secret) {
  console.error("CRON_SECRET is not set; see .env.example");
  process.exit(1);
}

async function tick() {
  try {
    const response = await fetch(`${base}/api/cron/reconcile`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
    });
    const body = await response.text();
    console.log(`${new Date().toISOString()} ${response.status} ${body}`);
  } catch (error) {
    console.log(`${new Date().toISOString()} app not reachable: ${String(error)}`);
  }
}

console.log(`calling ${base}/api/cron/reconcile every ${intervalMs / 1000}s (Ctrl+C to stop)`);
void tick();
setInterval(() => void tick(), intervalMs);
