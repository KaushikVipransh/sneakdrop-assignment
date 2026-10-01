import { expect, test, type Page } from "@playwright/test";
import { resetDrop, sql } from "./db";

/** Turns the page's guest into the admin account, as a magic-link sign-in would. */
async function becomeAdmin(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Buy|Join the line/ })).toBeVisible();
  const getSession = () =>
    page.evaluate(() => fetch("/api/auth/get-session").then((r) => r.json()));
  await expect.poll(async () => (await getSession())?.user?.id ?? null).not.toBeNull();
  const session = await getSession();
  // Free the address from an earlier run, then give it to this guest.
  await sql(`update "user" set email = id || '@old.invalid' where email = 'admin@example.com'`);
  await sql(`update "user" set email = 'admin@example.com', is_anonymous = false where id = $1`, [
    session.user.id,
  ]);
  // Drop the 60 s session cache cookie so the server re-reads the user.
  const cookies = await page.context().cookies();
  await page.context().clearCookies();
  await page.context().addCookies(cookies.filter((c) => !c.name.includes("session_data")));
}

test("non-admins are turned away", async ({ page }) => {
  await resetDrop(20);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Buy" })).toBeVisible();
  // Wait for the guest session, then the admin API must refuse it.
  await expect
    .poll(() => page.evaluate(() => fetch("/api/admin/state").then((r) => r.status)))
    .toBe(403);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Admins only" })).toBeVisible();
});

test("admin console shows live counts, the invariant, and webhook outcomes", async ({
  page,
  browser,
}) => {
  await resetDrop(20);
  await becomeAdmin(page);
  await page.goto("/admin");
  await expect(page.getByTestId("invariant")).toHaveText(/invariant: orders \+ holds ≤ 20 ✓/);

  const buyer = await (await browser.newContext()).newPage();
  await buyer.goto("/");
  await buyer.getByRole("button", { name: "Buy" }).click();
  await expect(page.getByRole("region", { name: "Active holds (1)" })).toBeVisible();
  await buyer.getByRole("button", { name: "Pay now" }).click();
  await expect(buyer.getByRole("heading", { name: "It's yours." })).toBeVisible({
    timeout: 15_000,
  });

  const webhooks = page.getByRole("region", { name: "Webhook events (last 50)" });
  await expect(webhooks.getByText("order created")).toBeVisible();
  await expect(page.getByTestId("invariant")).toContainText("✓");
});

test("admin can change chaos settings and reset the drop", async ({ page }) => {
  await resetDrop(20);
  await becomeAdmin(page);
  await page.goto("/admin");
  const fail = page.getByRole("slider", { name: /Fail/ });
  await fail.fill("1");
  await page.getByRole("button", { name: "Save chaos" }).click();
  await expect(page.getByText("Chaos settings saved.")).toBeVisible();

  await page.getByRole("button", { name: "Reset drop" }).click();
  await expect(page.getByText("Reset the drop?", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Yes, reset" }).click();
  await expect(page.getByText("Drop reset. 20 pairs, fresh start.")).toBeVisible();
  // Chaos survives a reset (resetDrop() in the next spec calms the provider again).
  await expect(page.getByRole("slider", { name: /Fail/ })).toHaveValue("1");
});

test("admin signs in with the shared email and password", async ({ page }) => {
  test.skip(!process.env.E2E_ADMIN_PASSWORD, "set E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD");
  await resetDrop(20);
  await page.goto("/admin");
  await page.getByLabel("Email").fill(process.env.E2E_ADMIN_EMAIL!);
  await page.getByLabel("Password").fill("wrong-password-123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Wrong email or password.")).toBeVisible();
  await page.getByLabel("Password").fill(process.env.E2E_ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByTestId("invariant")).toBeVisible();
});
