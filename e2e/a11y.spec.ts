import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { resetDrop } from "./db";

async function axe(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const summary = results.violations.map(
    (v) => `${label}: ${v.id} (${v.impact}) ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
  );
  expect(summary).toEqual([]);
}

for (const scheme of ["light", "dark"] as const) {
  test(`no axe violations across card states (${scheme})`, async ({ browser }) => {
    await resetDrop(1);
    const context = await browser.newContext({ colorScheme: scheme });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Get a pair" })).toBeVisible();
    await axe(page, "available");

    await page.getByRole("button", { name: "Buy" }).click();
    await expect(page.getByTestId("countdown")).toBeVisible();
    await axe(page, "holding");

    const other = await (await browser.newContext({ colorScheme: scheme })).newPage();
    await other.goto("/");
    await other.getByRole("button", { name: "Join the line" }).click();
    await expect(other.getByText("#1", { exact: true })).toBeVisible();
    await axe(other, "in-line");
  });
}

test("the whole flow works from the keyboard", async ({ page }) => {
  await resetDrop(20);
  await page.goto("/");
  const buy = page.getByRole("button", { name: "Buy" });
  await expect(buy).toBeVisible();
  // Tab until Buy has focus, then press Enter.
  for (let i = 0; i < 10 && !(await buy.evaluate((el) => el === document.activeElement)); i++) {
    await page.keyboard.press("Tab");
  }
  await expect(buy).toBeFocused();
  await page.keyboard.press("Enter");
  const pay = page.getByRole("button", { name: "Pay now" });
  await expect(pay).toBeVisible();
  await pay.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "It's yours." })).toBeVisible({ timeout: 15_000 });
});

for (const width of [375, 768, 1280]) {
  test(`no horizontal scroll at ${width}px`, async ({ page }) => {
    await resetDrop(20);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.getByRole("button", { name: "Buy" }).click();
    await expect(page.getByTestId("countdown")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
    // Touch targets are at least 44px tall.
    for (const name of ["Pay now", "Release"]) {
      const box = await page.getByRole("button", { name }).boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
  });
}
