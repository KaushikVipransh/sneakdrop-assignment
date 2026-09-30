import { auth, type Session } from "../auth";
import { jsonError } from "./json";

export type AuthedUser = Session["user"];

export type RequireUserResult = { ok: true; user: AuthedUser } | { ok: false; response: Response };

/** Resolves the session from the request cookies, or a ready-to-return 401. */
export async function requireUser(request: Request): Promise<RequireUserResult> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return {
      ok: false,
      response: jsonError(401, "UNAUTHENTICATED", "Sign in (or refresh the page) to continue."),
    };
  }
  return { ok: true, user: session.user };
}
