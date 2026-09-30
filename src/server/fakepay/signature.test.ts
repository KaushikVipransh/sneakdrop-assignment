import { describe, expect, it } from "vitest";
import { SIGNATURE_TOLERANCE_SECONDS, sign, verify } from "./signature";

const secret = "test-secret-with-enough-length";
const payload = JSON.stringify({ id: "evt_1", type: "payment.succeeded" });
const now = new Date("2026-10-15T10:00:00Z");

describe("webhook signatures", () => {
  it("accepts a valid signature", () => {
    const header = sign(payload, secret, now);
    expect(header).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
    expect(verify(header, payload, secret, now)).toEqual({ ok: true });
  });

  it("rejects a tampered payload", () => {
    const header = sign(payload, secret, now);
    expect(verify(header, payload.replace("succeeded", "failed"), secret, now)).toEqual({
      ok: false,
      reason: "mismatch",
    });
  });

  it("rejects the wrong secret", () => {
    const header = sign(payload, secret, now);
    expect(verify(header, payload, "another-secret-of-enough-length", now).ok).toBe(false);
  });

  it("rejects a stale signature", () => {
    const header = sign(payload, secret, now);
    const later = new Date(now.getTime() + (SIGNATURE_TOLERANCE_SECONDS + 1) * 1000);
    expect(verify(header, payload, secret, later)).toEqual({ ok: false, reason: "stale" });
  });

  it("rejects malformed headers", () => {
    for (const header of [null, "", "garbage", "t=abc,v1=00", "t=1,v1=zz"]) {
      expect(verify(header, payload, secret, now)).toEqual({ ok: false, reason: "malformed" });
    }
  });
});
