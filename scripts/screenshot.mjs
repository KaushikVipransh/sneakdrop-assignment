// Dev helper: node scripts/screenshot.mjs <url> <out.png> [width] [light|dark]
import { chromium } from "@playwright/test";
const [url, out, width = "1280", scheme = "light"] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: Number(width), height: 900 },
  colorScheme: scheme,
});
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.screenshot({ path: out, fullPage: true });
const overflow = await page.evaluate(
  () => document.documentElement.scrollWidth > window.innerWidth,
);
console.log("saved", out, "horizontal overflow:", overflow);
await browser.close();
