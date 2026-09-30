import { config } from "dotenv";

config({ quiet: true });
// Tests always run against the dedicated test database.
process.env.DATABASE_URL =
  process.env.DATABASE_URL_TEST ?? "postgres://sneakdrop:sneakdrop@localhost:5432/sneakdrop_test";
process.env.DB_POOL_MAX ??= "20";
process.env.WEBHOOK_SECRET ??= "test-webhook-secret-0123456789";
process.env.BETTER_AUTH_SECRET ??= "test-better-auth-secret-0123456789abcdef";
process.env.CRON_SECRET ??= "test-cron-secret-0123456789";
