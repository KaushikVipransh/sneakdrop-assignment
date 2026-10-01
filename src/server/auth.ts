import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { anonymous, magicLink } from "better-auth/plugins";
import { db } from "./db/client";
import * as schema from "./db/schema";
import { env } from "./env";
import { transferGuestActivity } from "./auth-link";
import { sendMagicLinkEmail } from "./email";
import { trustedOrigins } from "./trusted-origins";

export const auth = betterAuth({
  appName: "Sneaker Drop",
  baseURL: env.APP_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: trustedOrigins({ ...process.env, APP_URL: env.APP_URL }),
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  // Password sign-in exists only for the shared admin account (see admin-account.ts).
  emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 12 },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    cookieCache: { enabled: true, maxAge: 60 },
  },
  rateLimit: {
    // Guest sign-in must survive a launch-second click storm (and the load test).
    customRules: {
      "/sign-in/anonymous": { window: 10, max: 5000 },
      "/sign-in/magic-link": { window: 60, max: 5 },
    },
  },
  plugins: [
    anonymous({
      emailDomainName: "guest.sneakdrop.invalid",
      onLinkAccount: ({ anonymousUser, newUser }) =>
        transferGuestActivity(anonymousUser.user.id, newUser.user.id),
    }),
    magicLink({
      sendMagicLink: ({ email, url }) => sendMagicLinkEmail(email, url),
    }),
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
