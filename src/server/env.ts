import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.url({ message: "DATABASE_URL must be a Postgres connection URL" }),
  DATABASE_URL_DIRECT: z.url().optional(),
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),
  /** Public base URL of this app; the fake provider POSTs webhooks here. */
  APP_URL: z.url().default("http://localhost:3000"),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  /** Optional: without it, magic links are printed to the server console. */
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("Sneaker Drop <onboarding@resend.dev>"),
  /** Shared secret the external scheduler sends as "Authorization: Bearer <secret>". */
  CRON_SECRET: z.string().min(16, "CRON_SECRET must be at least 16 characters"),
  /** Comma-separated emails allowed into /admin (sign in with a magic link). */
  ADMIN_EMAILS: z.string().default(""),
  WEBHOOK_SECRET: z.string().min(16, "WEBHOOK_SECRET must be at least 16 characters"),
});

export type Env = z.infer<typeof envSchema>;

export class EnvError extends Error {
  constructor(issues: string[]) {
    super(`Invalid environment configuration:\n${issues.map((i) => `  - ${i}`).join("\n")}`);
    this.name = "EnvError";
  }
}

/** Parses an env source and throws one readable error listing every problem. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  // Treat empty strings as missing so `FOO=` in .env behaves like an unset var.
  const cleaned: Record<string, string | undefined> = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined && value !== ""),
  );
  // On Vercel, fall back to the deployment URL when APP_URL is not set.
  if (!cleaned.APP_URL && cleaned.VERCEL_PROJECT_PRODUCTION_URL) {
    cleaned.APP_URL = `https://${cleaned.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  const result = envSchema.safeParse(cleaned);
  if (!result.success) {
    throw new EnvError(
      result.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`),
    );
  }
  return result.data;
}

export const env: Env = parseEnv(process.env);
