import { joinWaitlist, leaveWaitlist } from "@/server/drop/waitlist";
import { handleUserAction } from "@/server/http/handler";
import { joinResult, leaveResult } from "@/server/http/results";

/** Join the line for the next free pair. */
export function POST(request: Request) {
  return handleUserAction(request, async ({ user, drop }) =>
    joinResult(await joinWaitlist(user.id, drop.id)),
  );
}

/** Leave the line. */
export function DELETE(request: Request) {
  return handleUserAction(request, async ({ user, drop }) =>
    leaveResult(await leaveWaitlist(user.id, drop.id)),
  );
}
