import { applyPaymentEvent } from "@/server/drop/webhook";
import { env } from "@/server/env";
import { paymentEventSchema } from "@/server/fakepay/events";
import { SIGNATURE_HEADER, verify } from "@/server/fakepay/signature";
import { jsonError } from "@/server/http/json";
import { log } from "@/server/log";

/** Receives the fake provider's signed payment events. */
export async function POST(request: Request): Promise<Response> {
  // Verify against the raw bytes; parsing first would let re-serialisation change them.
  const raw = await request.text();
  const signature = verify(request.headers.get(SIGNATURE_HEADER), raw, env.WEBHOOK_SECRET);
  if (!signature.ok) {
    log.warn("webhook.rejected", { reason: signature.reason });
    return jsonError(401, "INVALID_SIGNATURE", `Signature ${signature.reason}`);
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return jsonError(400, "INVALID_BODY", "Body is not JSON");
  }
  const event = paymentEventSchema.safeParse(body);
  if (!event.success) return jsonError(400, "INVALID_BODY", "Body is not a payment event");

  const result = await applyPaymentEvent(event.data);
  log.info("webhook.applied", {
    eventId: event.data.id,
    type: event.data.type,
    intentId: event.data.data.intent_id,
    result: result.code === "PROCESSED" ? result.outcome : result.code,
  });

  switch (result.code) {
    case "PROCESSED":
      return Response.json({ received: true, result: result.outcome });
    case "DUPLICATE":
      return Response.json({ received: true, result: "duplicate" });
    case "UNKNOWN_INTENT":
      // Non-2xx makes the provider retry later.
      return jsonError(409, "UNKNOWN_INTENT", "Intent not found yet");
  }
}
