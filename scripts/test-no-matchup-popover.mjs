import { chromium } from '@playwright/test';

const browser = await chromium.connectOverCDP('http://localhost:9222');
let page = null;
for (const ctx of browser.contexts()) {
  for (const p of ctx.pages()) {
    if (p.url().includes('/game/lobby/')) {
      page = p;
      break;
    }
  }
  if (page) break;
}
if (!page) {
  console.error('No lobby tab. Open a lobby tab first.');
  process.exit(1);
}
await page.bringToFront();
await page.waitForTimeout(300);

// Make sure compact (matchups visible)
const matchupsToggleVisible = await page.locator('button:has-text("◂ Matchups")').count();
if (matchupsToggleVisible) {
  await page.locator('button:has-text("◂ Matchups")').first().click();
  await page.waitForTimeout(300);
}

// Find a grayscale (no data) hero portrait. The .portraitImgHasData class is added when hasData=true,
// so a portrait without that class is the grayscale one.
const grayPortraits = page.locator('button[class*="portraitCard"]:not(:has(img[class*="portraitImgHasData"]))');
const count = await grayPortraits.count();
console.log(`Found ${count} grayscale (no-data) portraits`);

if (count === 0) {
  console.error('No grayscale portraits found. Are matchups loaded?');
  await browser.close();
  process.exit(1);
}

// Click the first one
const firstGray = grayPortraits.first();
await firstGray.scrollIntoViewIfNeeded();
const rectBefore = await firstGray.boundingBox();
console.log('Clicked portrait at', rectBefore);
await firstGray.click();
await page.waitForTimeout(250);

// Find the popover and measure
const popover = page.locator('div[class*="noDataPopover"]');
const visible = await popover.isVisible();
console.log('Popover visible?', visible);

if (visible) {
  const popRect = await popover.boundingBox();
  console.log('Popover rect:', popRect);
  console.log('Distance from click to popover (left):', popRect.x - rectBefore.x);
  console.log('Vertical alignment: portrait center', rectBefore.y + rectBefore.height / 2,
              'popover center', popRect.y + popRect.height / 2);
}

await page.screenshot({ path: 'scripts/no-matchup-popover.png', fullPage: false });
console.log('Saved scripts/no-matchup-popover.png');
await browser.close();
