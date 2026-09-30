import { describe, expect, it } from "vitest";
import { trustedOrigins } from "./trusted-origins";

describe("trustedOrigins", () => {
  it("trusts the app URL and every URL Vercel serves the deployment on", () => {
    expect(
      trustedOrigins({
        APP_URL: "https://sneakdrop-one.vercel.app",
        VERCEL_URL: "sneakdrop-abc123-team.vercel.app",
        VERCEL_BRANCH_URL: "sneakdrop-git-main-team.vercel.app",
        VERCEL_PROJECT_PRODUCTION_URL: "sneakdrop-one.vercel.app",
        TRUSTED_ORIGINS: "https://sneakdrop-team.vercel.app, https://drop.example.com",
      }),
    ).toEqual([
      "https://sneakdrop-one.vercel.app",
      "https://sneakdrop-abc123-team.vercel.app",
      "https://sneakdrop-git-main-team.vercel.app",
      "https://sneakdrop-team.vercel.app",
      "https://drop.example.com",
    ]);
  });

  it("is just the app URL locally", () => {
    expect(trustedOrigins({ APP_URL: "http://localhost:3000" })).toEqual(["http://localhost:3000"]);
  });
});
