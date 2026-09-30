import { auth } from "@/server/auth";

/** Creates a guest user and returns a Cookie header that authenticates as them. */
export async function guestCookie(): Promise<{ cookie: string; userId: string }> {
  const { headers, response } = await auth.api.signInAnonymous({ returnHeaders: true });
  const setCookie = headers.getSetCookie();
  const cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
  return { cookie, userId: response!.user.id };
}
