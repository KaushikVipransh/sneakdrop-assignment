import { log } from "../log";
import { jsonError } from "./json";
import { requireAdmin } from "./require-admin";
import type { AuthedUser } from "./require-user";

/** Route adapter for admin endpoints: admin check, then the action, errors as a logged 500. */
export async function handleAdmin(
  request: Request,
  action: (user: AuthedUser) => Promise<Response>,
): Promise<Response> {
  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;
  try {
    return await action(admin.user);
  } catch (error) {
    log.error("admin.unhandled", {
      path: new URL(request.url).pathname,
      error: error instanceof Error ? error.message : String(error),
    });
    return jsonError(500, "INTERNAL", "Something went wrong.");
  }
}
