/** Stable error body for every API route: `{ code, message }`. */
export function jsonError(status: number, code: string, message: string): Response {
  return Response.json({ code, message }, { status });
}
