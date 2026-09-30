/**
 * Origins allowed to call the auth endpoints. Vercel serves one deployment on
 * several hostnames (production domain, team alias, branch and deployment
 * URLs); a sign-in from any of them must work, so all are trusted, plus any
 * extra origins listed in TRUSTED_ORIGINS (comma-separated).
 */
export function trustedOrigins(source: Record<string, string | undefined>): string[] {
  const https = (host?: string) => (host ? `https://${host}` : undefined);
  const extra = (source.TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  const all = [
    source.APP_URL,
    https(source.VERCEL_URL),
    https(source.VERCEL_BRANCH_URL),
    https(source.VERCEL_PROJECT_PRODUCTION_URL),
    ...extra,
  ].filter((o): o is string => Boolean(o));
  return [...new Set(all.map((o) => o.replace(/\/$/, "")))];
}
