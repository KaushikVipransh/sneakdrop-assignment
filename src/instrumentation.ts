export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Importing env validates it; a bad config stops the server before it takes traffic.
    await import("./server/env");
  }
}
