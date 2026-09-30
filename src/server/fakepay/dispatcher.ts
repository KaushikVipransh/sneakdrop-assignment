import { sql } from "drizzle-orm";
import { db } from "../db/client";
import { env } from "../env";
import { log } from "../log";
import { SIGNATURE_HEADER, sign } from "./signature";

export const MAX_ATTEMPTS = 5;
/** How long a claimed delivery is reserved for the dispatcher that claimed it. */
const LEASE_MS = 30_000;
const REQUEST_TIMEOUT_MS = 10_000;

export type DispatchOptions = {
  limit?: number;
  webhookUrl?: string;
  now?: Date;
};

export type DispatchResult = { claimed: number; delivered: number; failed: number };

type Claimed = { id: number; event_id: string; payload: unknown; attempts: number };

/** Retry delay after the n-th failed attempt: 2 s, 4 s, 8 s, 16 s. */
export function backoffMs(attempts: number): number {
  return 1000 * 2 ** attempts;
}

export function defaultWebhookUrl(): string {
  return `${env.APP_URL}/api/webhooks/payments`;
}

/**
 * Sends every due webhook delivery as a real, signed HTTP POST.
 * Claiming uses `FOR UPDATE SKIP LOCKED` plus a short lease, so any number of
 * dispatchers (cron, status polls) can run at once without double-sending.
 */
export async function dispatchDue(options: DispatchOptions = {}): Promise<DispatchResult> {
  const limit = options.limit ?? 20;
  const url = options.webhookUrl ?? defaultWebhookUrl();
  const now = options.now ?? new Date();

  const { rows: claimed } = await db.execute<Claimed>(sql`
    update fakepay_deliveries d
    set attempts = d.attempts + 1,
        deliver_at = ${new Date(now.getTime() + LEASE_MS)}
    where d.id in (
      select id from fakepay_deliveries
      where status = 'PENDING' and deliver_at <= ${now}
      order by deliver_at, id
      limit ${limit}
      for update skip locked
    )
    returning d.id, d.event_id, d.payload, d.attempts
  `);

  let delivered = 0;
  await Promise.all(
    claimed.map(async (row) => {
      const error = await post(url, JSON.stringify(row.payload));
      if (error === null) {
        delivered++;
        await db.execute(sql`
          update fakepay_deliveries
          set status = 'DELIVERED', delivered_at = ${new Date()}, last_error = null
          where id = ${row.id}
        `);
        return;
      }
      const dead = row.attempts >= MAX_ATTEMPTS;
      await db.execute(sql`
        update fakepay_deliveries
        set status = ${dead ? "DEAD" : "PENDING"},
            deliver_at = ${new Date(now.getTime() + backoffMs(row.attempts))},
            last_error = ${error}
        where id = ${row.id}
      `);
      log.warn("fakepay.delivery_failed", {
        deliveryId: row.id,
        eventId: row.event_id,
        attempts: row.attempts,
        dead,
        error,
      });
    }),
  );

  return { claimed: claimed.length, delivered, failed: claimed.length - delivered };
}

/** Returns null on a 2xx response, otherwise a short error description. */
async function post(url: string, body: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [SIGNATURE_HEADER]: sign(body, env.WEBHOOK_SECRET),
      },
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.ok) return null;
    return `HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
