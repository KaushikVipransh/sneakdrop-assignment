/**
 * Maps domain results to HTTP. Every body has a stable `{ code, message }`
 * plus result-specific data, so the client can switch on `code`.
 */
import type { CreateHoldResult, ReleaseHoldResult } from "../drop/holds";
import type { StartPaymentResult } from "../drop/payments";
import type { JoinWaitlistResult, LeaveWaitlistResult } from "../drop/waitlist";
import { presentHold, presentIntent } from "./present";

export type HttpResult = {
  status: number;
  body: { code: string; message: string } & Record<string, unknown>;
};

const limitMessage = (limit: number) => `Purchase limit reached (${limit} pairs).`;
const HOLDING_MESSAGE = "You already have a pair on hold. Pay or release it first.";
const notStarted = (startsAt: Date): HttpResult => ({
  status: 409,
  body: {
    code: "NOT_STARTED",
    message: "The drop hasn't opened yet.",
    startsAt: startsAt.toISOString(),
  },
});

export function holdResult(r: CreateHoldResult): HttpResult {
  switch (r.code) {
    case "HOLD_CREATED":
      return {
        status: 200,
        body: { code: r.code, message: "It's yours for 5 minutes.", hold: presentHold(r.hold) },
      };
    case "ALREADY_HOLDING":
      return {
        status: 200,
        body: { code: r.code, message: HOLDING_MESSAGE, hold: presentHold(r.hold) },
      };
    case "LIMIT_REACHED":
      return {
        status: 403,
        body: {
          code: r.code,
          message: limitMessage(r.limit),
          purchased: r.purchased,
          limit: r.limit,
        },
      };
    case "SOLD_OUT":
      return {
        status: 409,
        body: {
          code: r.code,
          message: "Sold out — for now. Join the line and we'll pass you the next free pair.",
          canJoinWaitlist: r.canJoinWaitlist,
        },
      };
    case "NOT_STARTED":
      return notStarted(r.startsAt);
  }
}

export function releaseResult(r: ReleaseHoldResult): HttpResult {
  switch (r.code) {
    case "RELEASED":
      return {
        status: 200,
        body: { code: r.code, message: "Released. The pair went back.", hold: presentHold(r.hold) },
      };
    case "NOT_FOUND":
      return { status: 404, body: { code: r.code, message: "Hold not found." } };
    case "NOT_ACTIVE":
      return {
        status: 409,
        body: { code: r.code, message: "This hold has already ended.", status: r.status },
      };
  }
}

export function payResult(r: StartPaymentResult): HttpResult {
  switch (r.code) {
    case "STARTED":
    case "ALREADY_PENDING":
      return {
        status: 200,
        body: {
          code: r.code,
          message: "Waiting for the payment provider.",
          intent: presentIntent(r.intent),
        },
      };
    case "NOT_FOUND":
      return { status: 404, body: { code: r.code, message: "Hold not found." } };
    case "NOT_ACTIVE":
      return {
        status: 409,
        body: {
          code: r.code,
          message: "This hold has ended, so it can't be paid.",
          status: r.status,
        },
      };
  }
}

export function joinResult(r: JoinWaitlistResult): HttpResult {
  switch (r.code) {
    case "JOINED":
    case "ALREADY_WAITING":
      return {
        status: 200,
        body: { code: r.code, message: `You're #${r.position} in line.`, position: r.position },
      };
    case "STOCK_AVAILABLE":
      return {
        status: 409,
        body: { code: r.code, message: "A pair is free right now. Click Buy instead." },
      };
    case "ALREADY_HOLDING":
      return { status: 409, body: { code: r.code, message: HOLDING_MESSAGE } };
    case "LIMIT_REACHED":
      return {
        status: 403,
        body: {
          code: r.code,
          message: limitMessage(r.limit),
          purchased: r.purchased,
          limit: r.limit,
        },
      };
    case "NOT_STARTED":
      return notStarted(r.startsAt);
  }
}

export function leaveResult(r: LeaveWaitlistResult): HttpResult {
  return r.code === "LEFT"
    ? { status: 200, body: { code: r.code, message: "You left the line." } }
    : { status: 404, body: { code: r.code, message: "You're not in line." } };
}
