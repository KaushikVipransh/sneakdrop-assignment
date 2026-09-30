import { db } from "@/server/db/client";
import { resetAndSeed } from "@/server/db/seed";
import { handleAdmin } from "@/server/http/admin-handler";
import { log } from "@/server/log";

/** Starts a fresh drop: clears holds, orders, the line, payments, and webhooks. */
export function POST(request: Request) {
  return handleAdmin(request, async (user) => {
    await resetAndSeed(db);
    log.info("admin.reset", { by: user.email });
    return Response.json({ code: "RESET", message: "Drop reset. 20 pairs, fresh start." });
  });
}
