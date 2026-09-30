import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { user } from "@/server/db/schema";
import { guestCookie } from "./auth";

/** A session cookie for a user whose email is in ADMIN_EMAILS. */
export async function adminCookie(): Promise<string> {
  const { cookie, userId } = await guestCookie();
  await db
    .update(user)
    .set({ email: process.env.ADMIN_EMAILS!.split(",")[0]!, isAnonymous: false })
    .where(eq(user.id, userId));
  // Only the session token: the cookie cache would still say "guest" for 60 s.
  return cookie
    .split("; ")
    .filter((c) => c.includes("session_token"))
    .join("; ");
}
