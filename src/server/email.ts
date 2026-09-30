import { env } from "./env";
import { log } from "./log";

/** Sends the sign-in link with Resend, or prints it when no API key is configured. */
export async function sendMagicLinkEmail(email: string, url: string): Promise<void> {
  if (!env.RESEND_API_KEY) {
    console.log(`\n[magic link] ${email}: ${url}\n`);
    return;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: email,
      subject: "Your Sneaker Drop sign-in link",
      text: `Sign in to Sneaker Drop: ${url}\n\nThe link expires in 5 minutes.`,
    }),
  });
  if (!response.ok) {
    log.error("email.send_failed", { status: response.status });
    throw new Error("Could not send the sign-in email");
  }
}
