/**
 * HTTP load test: N guests click Buy at the same moment, some of them pay,
 * and the fake provider delivers (possibly chaotic) webhooks. Prints what
 * happened and PASS/FAIL on the one thing that matters: orders ≤ stock.
 *
 *   pnpm loadtest --users 1000 --payRate 0.7 [--chaos] [--reset] [--url http://localhost:3000]
 *
 * --reset  clears the drop first (needs DATABASE_URL for the target database)
 * --chaos  sets duplicates 50%, reorder 20%, fail 10%, delay 0–5 s for this run
 * Final counts are read from the database when DATABASE_URL is set, otherwise
 * from the public status endpoint.
 */
import "dotenv/config";
import { parseArgs } from "node:util";
import { Client } from "pg";
import { Agent, setGlobalDispatcher } from "undici";

const { values: args } = parseArgs({
  options: {
    users: { type: "string", default: "1000" },
    payRate: { type: "string", default: "0.7" },
    url: { type: "string", default: process.env.APP_URL ?? "http://localhost:3000" },
    chaos: { type: "boolean", default: false },
    reset: { type: "boolean", default: false },
    concurrency: { type: "string", default: "100" },
    settleSeconds: { type: "string", default: "90" },
  },
});

// One machine opening 1,000 sockets at once overflows the server's listen backlog
// (real buyers come from many machines). All requests still start together;
// they queue on a fixed pool of keep-alive sockets.
setGlobalDispatcher(new Agent({ connections: 256, pipelining: 1 }));

const BASE = args.url!.replace(/\/$/, "");
const USERS = Number(args.users);
const PAY_RATE = Number(args.payRate);
const SIGNUP_CONCURRENCY = Number(args.concurrency);
const CRON_SECRET = process.env.CRON_SECRET;
const DATABASE_URL = process.env.LOADTEST_DATABASE_URL ?? process.env.DATABASE_URL;

type Timed<T> = { ms: number; status: number; body: T };

async function call<T = Record<string, unknown>>(
  path: string,
  init: RequestInit & { cookie?: string } = {},
): Promise<Timed<T>> {
  const started = performance.now();
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      origin: BASE,
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.cookie ? { cookie: init.cookie } : {}),
      ...init.headers,
    },
  });
  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // keep text
  }
  return { ms: performance.now() - started, status: response.status, body: body as T };
}

async function pool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!);
      }
    }),
  );
  return out;
}

const percentile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;
};

async function withDb<T>(fn: (c: Client) => Promise<T>): Promise<T | null> {
  if (!DATABASE_URL) return null;
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function main() {
  console.log(
    `target ${BASE} · ${USERS} users · payRate ${PAY_RATE} · chaos ${args.chaos ? "on" : "off"}`,
  );

  if (args.reset) {
    const done = await withDb(async (c) => {
      await c.query(`truncate table audit_log, fakepay_deliveries, webhook_events, payment_intents,
        waitlist_entries, orders, holds, drops restart identity cascade`);
      await c.query(`insert into drops (name, total_stock, starts_at)
        values ('Air Timebase 01 — "Zero Oversell"', 20, now())`);
    });
    if (done === null) throw new Error("--reset needs DATABASE_URL");
    console.log("drop reset to 20 pairs");
  }
  await withDb(async (c) => {
    const chaos = args.chaos ? [0, 5000, 0.5, 0.2, 0.1] : [0, 0, 0, 0, 0];
    await c.query(
      `insert into fakepay_settings (id, min_delay_ms, max_delay_ms, duplicate_rate, reorder_rate, fail_rate)
       values (1, $1, $2, $3, $4, $5)
       on conflict (id) do update set min_delay_ms = $1, max_delay_ms = $2,
         duplicate_rate = $3, reorder_rate = $4, fail_rate = $5`,
      chaos,
    );
  });

  // 1. Guests.
  let t = performance.now();
  const cookies = await pool(
    Array.from({ length: USERS }, (_, i) => i),
    SIGNUP_CONCURRENCY,
    async () => {
      const r = await fetch(`${BASE}/api/auth/sign-in/anonymous`, {
        method: "POST",
        headers: { origin: BASE, "content-type": "application/json" },
        body: "{}",
      });
      if (!r.ok) throw new Error(`guest sign-in failed: ${r.status} ${await r.text()}`);
      return r.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join("; "); // session token + cached session data, as a browser sends
    },
  );
  console.log(
    `created ${cookies.length} guests in ${((performance.now() - t) / 1000).toFixed(1)}s`,
  );

  // 2. Everyone clicks Buy at the same moment.
  t = performance.now();
  const buys = await Promise.all(
    cookies.map((cookie) =>
      call<{ code?: string; hold?: { id: string } }>("/api/drop/hold", { method: "POST", cookie }),
    ),
  );
  const buyWall = performance.now() - t;
  const codes: Record<string, number> = {};
  for (const b of buys) {
    const key = b.status >= 500 ? `HTTP ${b.status}` : (b.body.code ?? `HTTP ${b.status}`);
    codes[key] = (codes[key] ?? 0) + 1;
  }
  const latencies = buys.map((b) => b.ms);
  console.log(`Buy x${buys.length} in ${(buyWall / 1000).toFixed(2)}s:`, codes);
  console.log(
    `Buy latency ms: p50 ${percentile(latencies, 50).toFixed(0)} · p95 ${percentile(latencies, 95).toFixed(0)} · max ${Math.max(...latencies).toFixed(0)}`,
  );

  // 3. Some of the winners pay; everyone else who lost joins the line.
  const winners = buys
    .map((b, i) => ({ b, cookie: cookies[i]! }))
    .filter((x) => x.b.body.code === "HOLD_CREATED" && x.b.body.hold);
  const payers = winners.filter(() => Math.random() < PAY_RATE);
  const pays = await Promise.all(
    payers.map((p) =>
      call(`/api/holds/${p.b.body.hold!.id}/pay`, { method: "POST", cookie: p.cookie }),
    ),
  );
  const losers = buys
    .map((b, i) => ({ b, cookie: cookies[i]! }))
    .filter((x) => x.b.body.code === "SOLD_OUT")
    .slice(0, 200);
  const joins = await Promise.all(
    losers.map((l) => call("/api/drop/waitlist", { method: "POST", cookie: l.cookie })),
  );
  console.log(
    `paid ${pays.filter((p) => p.status === 200).length}/${payers.length} winners · ${joins.filter((j) => j.status === 200).length} losers joined the line`,
  );

  // 4. Let the provider deliver every webhook (the cron endpoint drives the dispatcher).
  const deadline = Date.now() + Number(args.settleSeconds) * 1000;
  let pending = Infinity;
  while (Date.now() < deadline) {
    if (CRON_SECRET) {
      await call("/api/cron/reconcile", {
        method: "POST",
        headers: { authorization: `Bearer ${CRON_SECRET}` },
      });
    }
    const p = await withDb(async (c) => {
      const { rows } = await c.query(
        `select count(*)::int as n from fakepay_deliveries where status = 'PENDING'`,
      );
      return rows[0].n as number;
    });
    pending = p ?? 0;
    if (pending === 0) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (pending > 0) console.log(`warning: ${pending} deliveries still pending after settle time`);

  // 5. Verify.
  const fromDb = await withDb(async (c) => {
    const q = async (sql: string) => (await c.query(sql)).rows[0];
    return {
      total: (await q(`select total_stock as n from drops order by created_at desc limit 1`))
        .n as number,
      orders: (await q(`select count(*)::int as n from orders`)).n as number,
      active: (await q(`select count(*)::int as n from holds where status = 'ACTIVE'`)).n as number,
      holdsCreated: (await q(`select count(*)::int as n from holds`)).n as number,
      refunds: (await q(`select count(*)::int as n from payment_intents where status = 'REFUNDED'`))
        .n as number,
      duplicates: (
        await q(
          `select count(*)::int as n from audit_log where entity = 'webhook' and to_status = 'duplicate'`,
        )
      ).n as number,
      maxPerUser: (
        await q(
          `select coalesce(max(n), 0)::int as n from (select count(*) n from orders group by user_id) x`,
        )
      ).n as number,
    };
  });
  const status = await call<{ drop: { total: number; sold: number; held: number } }>(
    "/api/drop/status",
  );
  const final = fromDb ?? {
    total: status.body.drop.total,
    orders: status.body.drop.sold,
    active: status.body.drop.held,
    holdsCreated: NaN,
    refunds: NaN,
    duplicates: NaN,
    maxPerUser: NaN,
  };
  const errors5xx =
    buys.filter((b) => b.status >= 500).length + pays.filter((p) => p.status >= 500).length;

  console.log("\nresult");
  console.log(`  holds created (incl. promotions): ${final.holdsCreated}`);
  console.log(`  orders confirmed:                 ${final.orders} / ${final.total}`);
  console.log(`  active holds now:                 ${final.active}`);
  console.log(`  refunds (late payments):          ${final.refunds}`);
  console.log(`  duplicate webhooks ignored:       ${final.duplicates}`);
  console.log(`  max pairs per user:               ${final.maxPerUser}`);
  console.log(`  5xx responses:                    ${errors5xx}`);

  const pass =
    final.orders <= final.total &&
    final.orders + final.active <= final.total &&
    (Number.isNaN(final.maxPerUser) || final.maxPerUser <= 2) &&
    errors5xx === 0;
  console.log(`\n${pass ? "PASS" : "FAIL"}: orders ≤ ${final.total}${pass ? "" : " (see above)"}`);
  process.exit(pass ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
