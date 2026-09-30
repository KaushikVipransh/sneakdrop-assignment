import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

type Handler = (request: Request) => Promise<Response>;

/** Serves a route handler over real HTTP so tests exercise the network path. */
export async function serveHandler(
  handler: Handler,
): Promise<{ url: string; close: () => Promise<void>; hits: () => number }> {
  let hits = 0;
  const server: Server = createServer(async (req, res) => {
    hits++;
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === "string") headers.set(key, value);
    }
    const response = await handler(
      new Request(`http://localhost${req.url}`, {
        method: req.method,
        headers,
        body: chunks.length ? Buffer.concat(chunks) : undefined,
      }),
    );
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    hits: () => hits,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
