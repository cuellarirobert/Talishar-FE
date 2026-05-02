// Counts and groups HTTP requests during a fresh home-page load.
// Usage:
//   1. Make sure CDP Chrome is running on :9222
//   2. node scripts/count-home-requests.mjs
//   3. The script will navigate the front tab to http://localhost:5173/
//      and record every request that fires for ~6s.

import { chromium } from '@playwright/test';

const browser = await chromium.connectOverCDP('http://localhost:9222');
let page = null;
for (const ctx of browser.contexts()) {
  for (const p of ctx.pages()) {
    if (p.url().startsWith('http://localhost:5173') || p.url().startsWith('http://localhost:8080')) {
      page = p;
      break;
    }
  }
  if (page) break;
}
if (!page) {
  console.error('No localhost tab found.');
  process.exit(1);
}
await page.bringToFront();

const records = [];
page.on('request', (req) => {
  const url = req.url();
  // Filter out static assets — we only care about API/data calls
  if (
    url.endsWith('.css') ||
    url.endsWith('.js') ||
    url.endsWith('.ts') ||
    url.endsWith('.tsx') ||
    url.endsWith('.svg') ||
    url.endsWith('.webp') ||
    url.endsWith('.png') ||
    url.endsWith('.jpg') ||
    url.endsWith('.woff2') ||
    url.endsWith('.woff') ||
    url.endsWith('/@vite/client') ||
    url.includes('/@react-refresh') ||
    url.includes('/@id/') ||
    url.includes('/@fs/') ||
    url.includes('/node_modules/') ||
    url.includes('/src/') ||
    url.includes('chrome-extension://')
  ) return;
  records.push({ method: req.method(), url, ts: Date.now() });
});

console.log('Navigating to http://localhost:5173/ ...');
const t0 = Date.now();
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' }).catch(() => {});
const tElapsed = Date.now() - t0;

// Wait a bit longer for any lazy/idle requests
await page.waitForTimeout(2000);

// Group by hostname + path (strip query)
const byEndpoint = new Map();
for (const r of records) {
  let pathname;
  try {
    const u = new URL(r.url);
    pathname = u.host + u.pathname;
  } catch {
    pathname = r.url;
  }
  const key = `${r.method} ${pathname}`;
  byEndpoint.set(key, (byEndpoint.get(key) || 0) + 1);
}

const sorted = [...byEndpoint.entries()].sort((a, b) => b[1] - a[1]);
console.log(`\nTotal API/data requests: ${records.length} in ${tElapsed}ms\n`);
console.log('By endpoint:');
for (const [key, count] of sorted) {
  console.log(`  ${count.toString().padStart(3)}× ${key}`);
}

await browser.close();
