export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Importing env validates it; a bad config stops the server before it takes traffic.
    const { env } = await import("./server/env");
    if (env.ADMIN_EMAIL && env.ADMIN_PASSWORD) {
      const { ensureAdminAccount } = await import("./server/admin-account");
      // Never block boot on this: the site works without the admin login.
      await ensureAdminAccount(env.ADMIN_EMAIL, env.ADMIN_PASSWORD).catch((error: unknown) =>
        console.error("admin account setup failed", error),
      );
    }
  }
}
