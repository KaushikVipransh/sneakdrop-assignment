import { expect, test } from "@playwright/test";
import { resetDrop } from "./db";

const card = (page: import("@playwright/test").Page) =>
  page.locator("section[aria-labelledby='card-label']");
const receipt = (page: import("@playwright/test").Page) =>
  page.locator("section[aria-labelledby='receipt-title']");

test("buy, pay, and get the pair; buy another, then release it", async ({ page }) => {
  await resetDrop(20);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Get a pair" })).toBeVisible();

  await page.getByRole("button", { name: "Buy" }).click();
  await expect(card(page).getByText("Your hold", { exact: true })).toBeVisible();
  await expect(page.getByTestId("countdown")).toHaveText(/0[45]:\d\d/);
  await expect(receipt(page).getByText("Hold created")).toBeVisible();

  await page.getByRole("button", { name: "Pay now" }).click();
  await expect(page.getByRole("heading", { name: "It's yours." })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("You've bought 1 of 2 pairs.")).toBeVisible();
  await expect(receipt(page).getByText("Purchase confirmed")).toBeVisible();

  await page.getByRole("button", { name: "Buy another" }).click();
  await expect(card(page).getByText("Your hold", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Release" }).click();
  await expect(page.getByRole("heading", { name: "Get a pair" })).toBeVisible();
  await expect(receipt(page).getByText("Hold released")).toBeVisible();
});

test("sold out: join the line, then get promoted when a hold is released", async ({ browser }) => {
  await resetDrop(1);
  const alice = await (await browser.newContext()).newPage();
  const bob = await (await browser.newContext()).newPage();

  await alice.goto("/");
  await alice.getByRole("button", { name: "Buy" }).click();
  await expect(card(alice).getByText("Your hold", { exact: true })).toBeVisible();

  await bob.goto("/");
  await expect(bob.getByRole("heading", { name: "Sold out — for now" })).toBeVisible();
  await bob.getByRole("button", { name: "Join the line" }).click();
  await expect(bob.getByText("#1", { exact: true })).toBeVisible();

  await alice.getByRole("button", { name: "Release" }).click();
  // Bob's page switches from his place in line to his own hold, without a reload.
  await expect(bob.getByRole("heading", { name: "Your turn." })).toBeVisible({ timeout: 10_000 });
  await expect(bob).toHaveTitle(/Your turn/);
  await expect(receipt(bob).getByText("Your turn — promoted from the line")).toBeVisible();
});

test("limit: after two pairs the card says so", async ({ page }) => {
  await resetDrop(20);
  await page.goto("/");
  for (let i = 0; i < 2; i++) {
    await page.getByRole("button", { name: i === 0 ? "Buy" : "Buy another" }).click();
    await page.getByRole("button", { name: "Pay now" }).click();
    await expect(page.getByText(`You've bought ${i + 1} of 2 pairs.`)).toBeVisible({
      timeout: 15_000,
    });
  }
  await expect(page.getByRole("heading", { name: "That's your two." })).toBeVisible();
});
