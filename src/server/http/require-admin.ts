import { auth } from "../auth";
import { env } from "../env";
import { jsonError } from "./json";
import type { RequireUserResult } from "./require-user";

export function isAdminEmail(email: string | null | undefined, list: string): boolean {
  if (!email) return false;
  const admins = list
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(email.toLowerCase());
}

/** Session check for admin routes: 401 without a session, 403 unless the email is an admin. */
export async function requireAdmin(request: Request): Promise<RequireUserResult> {
  return checkAdmin(request.headers);
}

export async function checkAdmin(headers: Headers): Promise<RequireUserResult> {
  const session = await auth.api.getSession({ headers });
  if (!session) {
    return { ok: false, response: jsonError(401, "UNAUTHENTICATED", "Sign in to continue.") };
  }
  // Guests have a generated placeholder email and are never admins.
  const admins = [env.ADMIN_EMAILS, env.ADMIN_EMAIL ?? ""].join(",");
  if (session.user.isAnonymous || !isAdminEmail(session.user.email, admins)) {
    return { ok: false, response: jsonError(403, "FORBIDDEN", "Admins only.") };
  }
  return { ok: true, user: session.user };
}
