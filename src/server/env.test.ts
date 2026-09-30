import { describe, expect, it } from "vitest";
import { EnvError, parseEnv } from "./env";

describe("parseEnv", () => {
  it("accepts a valid environment", () => {
    const env = parseEnv({ DATABASE_URL: "postgres://u:p@localhost:5432/db" });
    expect(env.DATABASE_URL).toBe("postgres://u:p@localhost:5432/db");
    expect(env.NODE_ENV).toBe("development");
  });

  it("fails with a clear message when DATABASE_URL is missing", () => {
    expect(() => parseEnv({})).toThrow(EnvError);
    expect(() => parseEnv({ DATABASE_URL: "" })).toThrow(/DATABASE_URL/);
  });
});
