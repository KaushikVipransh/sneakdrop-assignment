import { createHmac, timingSafeEqual } from "node:crypto";

export const SIGNATURE_HEADER = "x-fakepay-signature";
/** Signatures older than this are rejected, which blocks replay of captured requests. */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

function digest(timestamp: number, payload: string, secret: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
}

/** Builds a `t=<unix seconds>,v1=<hex HMAC-SHA256 of "t.payload">` header. */
export function sign(payload: string, secret: string, now: Date = new Date()): string {
  const timestamp = Math.floor(now.getTime() / 1000);
  return `t=${timestamp},v1=${digest(timestamp, payload, secret)}`;
}

export type VerifyResult = { ok: true } | { ok: false; reason: "malformed" | "stale" | "mismatch" };

export function verify(
  header: string | null | undefined,
  payload: string,
  secret: string,
  now: Date = new Date(),
): VerifyResult {
  const match = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(header ?? "");
  if (!match) return { ok: false, reason: "malformed" };
  const timestamp = Number(match[1]);
  const given = Buffer.from(match[2]!, "hex");

  if (Math.abs(now.getTime() / 1000 - timestamp) > SIGNATURE_TOLERANCE_SECONDS) {
    return { ok: false, reason: "stale" };
  }
  const expected = Buffer.from(digest(timestamp, payload, secret), "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, reason: "mismatch" };
  }
  return { ok: true };
}
