import { auth } from "@/server/auth";
import { getCurrentDrop } from "@/server/drop/current";
import { getDropStatus, hasDueDeliveries } from "@/server/drop/status";
import { dispatchDue } from "@/server/fakepay/dispatcher";
import { afterResponse } from "@/server/http/after-response";
import { jsonError } from "@/server/http/json";

/** Live state of the drop and of the signed-in user. Polled every 1.5 s. */
export async function GET(request: Request): Promise<Response> {
  const drop = await getCurrentDrop();
  if (!drop) return jsonError(404, "NO_DROP", "There is no drop right now.");

  const session = await auth.api.getSession({ headers: request.headers });
  const viewer = session
    ? {
        id: session.user.id,
        email: session.user.email,
        isGuest: Boolean(session.user.isAnonymous),
      }
    : null;
  const status = await getDropStatus(drop.id, viewer);

  // Polls double as a delivery trigger for the fake provider's webhooks.
  afterResponse("fakepay.dispatch", async () => {
    if (await hasDueDeliveries()) await dispatchDue();
  });

  return Response.json(status, { headers: { "cache-control": "no-store" } });
}
