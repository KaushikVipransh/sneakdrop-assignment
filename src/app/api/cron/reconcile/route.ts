import { createHash, timingSafeEqual } from "node:crypto";
import { getCurrentDrop } from "@/server/drop/current";
import { inDropTx } from "@/server/drop/tx";
import { env } from "@/server/env";
import { dispatchDue } from "@/server/fakepay/dispatcher";
import { jsonError } from "@/server/http/json";
import { log } from "@/server/log";

function authorized(request: Request): boolean {
  const header = request.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  // Compare fixed-length digests so the check takes the same time for any input.
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return given.length > 0 && timingSafeEqual(digest(given), digest(env.CRON_SECRET));
}

/**
 * Called every minute by an external scheduler (cron-job.org / QStash), so holds
 * expire, waiters get promoted, and webhooks get delivered even with no visitors.
 */
async function run(request: Request): Promise<Response> {
  if (!authorized(request)) return jsonError(401, "UNAUTHORIZED", "Missing or wrong cron secret.");

  const drop = await getCurrentDrop();
  const reconciled = drop
    ? await inDropTx(drop.id, {}, async ({ reconciled }) => reconciled)
    : null;
  const dispatched = await dispatchDue({ limit: 50 });

  const summary = {
    ok: true,
    expired: reconciled?.expired.length ?? 0,
    promoted: reconciled?.promoted.length ?? 0,
    skipped: reconciled?.skipped.length ?? 0,
    deliveries: dispatched,
  };
  log.info("cron.reconcile", summary);
  return Response.json(summary);
}

export const POST = run;
export const GET = run;
