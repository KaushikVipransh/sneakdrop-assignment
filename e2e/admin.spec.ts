import { expect, test, type Page } from "@playwright/test";
import { resetDrop, sql } from "./db";

/** Turns the page's guest into the admin account, as a magic-link sign-in would. */
async function becomeAdmin(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Buy|Join the line/ })).toBeVisible();
  const session = await page.evaluate(() => fetch("/api/auth/get-session").then((r) => r.json()));
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
  const status = await page.evaluate(() => fetch("/api/admin/state").then((r) => r.status));
  expect(status).toBe(403);
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
