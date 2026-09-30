/**
 * Dev helper: puts the local drop into a mid-sale state and screenshots the
 * status page (holding) at phone, tablet, and desktop widths.
 * Usage: pnpm dev, then pnpm tsx scripts/shoot-ui.ts <outDir>
 * Resets the dev database.
 */
import { chromium } from "@playwright/test";
import { resetDrop, sql } from "../e2e/db";

const out = process.argv[2] ?? ".";
const base = process.env.E2E_BASE_URL ?? "http://localhost:3000";

async function main() {
  await resetDrop(20);
  await sql(`
    with d as (select id from drops limit 1),
    h as (
      insert into holds (drop_id, user_id, status, expires_at, ended_at)
      select d.id, 'seed-' || g, 'CONVERTED', now(), now() from d, generate_series(1, 9) g
      returning id, drop_id, user_id
    )
    insert into orders (drop_id, user_id, hold_id) select drop_id, user_id, id from h
  `);
  await sql(`
    insert into holds (drop_id, user_id, expires_at)
    select id, 'held-' || g, now() + interval '4 minutes' from drops, generate_series(1, 4) g
  `);

  const browser = await chromium.launch();
  for (const width of [1280, 768, 375]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.goto(base);
    if (width === 1280) {
      await page.getByRole("button", { name: "Buy" }).click();
    }
    await page.locator("section[aria-labelledby='card-label']").waitFor();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${out}/ui-${width}.png`, fullPage: true });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    console.log(width, "overflow:", overflow);
    await page.close();
  }
  await browser.close();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
