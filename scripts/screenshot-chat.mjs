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
  console.error('No lobby tab found.');
  process.exit(1);
}
await page.bringToFront();
await page.waitForTimeout(300);

// Make sure we're in compact mode (not expanded chat)
const matchupsToggle = await page.locator('button:has-text("◂ Matchups")').count();
if (matchupsToggle) {
  console.log('Currently expanded — switching to compact');
  await page.locator('button:has-text("◂ Matchups")').first().click();
  await page.waitForTimeout(400);
}

const chat = page.locator('div[class*="chatAreaContainer"]').first();
await chat.screenshot({ path: 'scripts/chat-column.png' });
console.log('Saved scripts/chat-column.png');
await browser.close();
