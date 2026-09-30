import { releaseHold } from "@/server/drop/holds";
import { handleUserAction } from "@/server/http/handler";
import { releaseResult } from "@/server/http/results";

/** Give a held pair back. */
export async function POST(request: Request, ctx: RouteContext<"/api/holds/[id]/release">) {
  const { id } = await ctx.params;
  return handleUserAction(request, async ({ user }) =>
    releaseResult(await releaseHold(user.id, id)),
  );
}
