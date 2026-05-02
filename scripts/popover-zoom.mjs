import { chromium } from '@playwright/test';
const browser = await chromium.connectOverCDP('http://localhost:9222');
let page = null;
for (const ctx of browser.contexts()) {
  for (const p of ctx.pages()) {
    if (p.url().includes('/game/lobby/')) { page = p; break; }
  }
  if (page) break;
}
await page.bringToFront();
await page.waitForTimeout(200);

// Re-trigger popover by clicking a grayscale portrait
const grayPortraits = page.locator('button[class*="portraitCard"]:not(:has(img[class*="portraitImgHasData"]))');
if (await grayPortraits.count() > 0) {
  await grayPortraits.first().click();
  await page.waitForTimeout(250);
}

const popover = page.locator('div[class*="noDataPopover"]');
if (await popover.isVisible().catch(() => false)) {
  const box = await popover.boundingBox();
  await page.screenshot({
    path: 'scripts/popover-zoom.png',
    clip: {
      x: Math.max(0, box.x - 30),
      y: Math.max(0, box.y - 20),
      width: Math.min(box.width + 350, 800),
      height: box.height + 40,
    },
  });
  console.log('saved');
} else {
  console.log('popover not visible');
}
await browser.close();
