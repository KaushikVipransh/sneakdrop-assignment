import type { Drop } from "../db/schema";
import { getCurrentDrop } from "../drop/current";
import { DropNotFound } from "../drop/errors";
import { log } from "../log";
import { jsonError } from "./json";
import { requireUser, type AuthedUser } from "./require-user";
import type { HttpResult } from "./results";

type Context = { request: Request; user: AuthedUser; drop: Drop };

const noDrop = () => jsonError(404, "NO_DROP", "There is no drop right now.");

/**
 * Route adapter: authenticate, find the current drop, run the domain call,
 * map its result to HTTP. Unexpected errors become a logged 500.
 */
export async function handleUserAction(
  request: Request,
  action: (ctx: Context) => Promise<HttpResult>,
): Promise<Response> {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;
  try {
    const drop = await getCurrentDrop();
    if (!drop) return noDrop();
    const { status, body } = await action({ request, user: auth.user, drop });
    return Response.json(body, { status });
  } catch (error) {
    if (error instanceof DropNotFound) return noDrop();
    log.error("api.unhandled", {
      path: new URL(request.url).pathname,
      userId: auth.user.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return jsonError(500, "INTERNAL", "Something went wrong. Please try again.");
  }
}
