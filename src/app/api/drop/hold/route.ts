import { createHold } from "@/server/drop/holds";
import { handleUserAction } from "@/server/http/handler";
import { holdResult } from "@/server/http/results";

/** Buy: reserve one pair for 5 minutes. */
export function POST(request: Request) {
  return handleUserAction(request, async ({ user, drop }) =>
    holdResult(await createHold(user.id, drop.id)),
  );
}
