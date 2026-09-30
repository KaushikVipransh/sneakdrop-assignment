/** Usage: pnpm db:seed | pnpm db:reset */
import "dotenv/config";

async function main() {
  const { db, pool } = await import("../src/server/db/client");
  const { resetAndSeed, seed } = await import("../src/server/db/seed");
  if (process.argv.includes("--reset")) {
    await resetAndSeed(db);
    console.log("drop state cleared and reseeded");
  } else {
    await seed(db);
    console.log("seeded");
  }
  await pool.end();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
