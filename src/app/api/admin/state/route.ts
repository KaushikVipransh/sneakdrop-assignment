import { getAdminState } from "@/server/admin/state";
import { handleAdmin } from "@/server/http/admin-handler";

/** Operator view: counts, invariant, holds, queue, webhooks, chaos settings. */
export function GET(request: Request) {
  return handleAdmin(request, async () =>
    Response.json(await getAdminState(), { headers: { "cache-control": "no-store" } }),
  );
}
