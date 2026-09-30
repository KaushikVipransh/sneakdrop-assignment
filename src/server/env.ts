import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.url({ message: "DATABASE_URL must be a Postgres connection URL" }),
  DATABASE_URL_DIRECT: z.url().optional(),
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
  const cleaned = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined && value !== ""),
  );
  const result = envSchema.safeParse(cleaned);
  if (!result.success) {
    throw new EnvError(
      result.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`),
    );
  }
  return result.data;
}

export const env: Env = parseEnv(process.env);
