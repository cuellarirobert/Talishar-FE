// Streams lobby-relevant API responses from the running Chrome to stdout.
// Usage: keep your CDP Chrome on the lobby tab, then `node scripts/sniff-lobby-api.mjs`.
// Load decks / change heroes / toggle stuff in the tab — every relevant
// response prints as pretty JSON. Ctrl-C to stop.

import { chromium } from '@playwright/test';

// Endpoints we care about. Anything containing one of these substrings
// in its URL gets logged.
const INTERESTING = [
  'GetLobbyInfo',
  'GetLobbyRefresh',
  'JoinGame',
  'SubmitSideboard',
  'SubmitLobbyInput',
  'UpdateBazaarMatchup',
];

const browser = await chromium.connectOverCDP('http://localhost:9222');

// Wait briefly for contexts/pages to populate
await new Promise((r) => setTimeout(r, 500));

const allPages = [];
for (const ctx of browser.contexts()) {
  for (const p of ctx.pages()) allPages.push(p);
}

console.log('All pages seen via CDP:');
for (const p of allPages) console.log('  -', p.url());

let lobbyPage = allPages.find((p) => p.url().includes('/game/lobby/'));

// Fallback: ask each context to wait for any new pages, in case the first
// pass missed it (race condition right after connect)
if (!lobbyPage) {
  for (const ctx of browser.contexts()) {
    try {
      const p = await ctx.waitForEvent('page', { timeout: 1000 });
      if (p.url().includes('/game/lobby/')) {
        lobbyPage = p;
        break;
      }
    } catch {}
  }
}

if (!lobbyPage) {
  console.error('\nNo lobby tab found.');
  console.error('If you see your lobby URL in the list above, the issue is Playwright not exposing it via CDP.');
  console.error('Try refreshing the lobby tab and re-running the script.');
  await browser.close();
  process.exit(1);
}
console.log('Sniffing on:', lobbyPage.url());
console.log('Watching for:', INTERESTING.join(', '));
console.log('Interact with the page; responses will print below.\n');

lobbyPage.on('response', async (res) => {
  const url = res.url();
  if (!INTERESTING.some((kw) => url.includes(kw))) return;
  const status = res.status();
  const method = res.request().method();
  const ts = new Date().toISOString().slice(11, 23);
  const short = url.replace(/^.*\/(?=[^/]+\.php)/, '').slice(0, 80);

  let body = null;
  try {
    body = await res.json();
  } catch {
    try {
      body = (await res.text()).slice(0, 300);
    } catch {
      body = '<could not read body>';
    }
  }

  console.log(`\n[${ts}] ${method} ${short}  →  ${status}`);

  // Specifically highlight the matchups array if present (that's what we care about
  // for the "what does the backend send for a given hero?" question)
  if (body && typeof body === 'object' && Array.isArray(body.matchups)) {
    console.log(`  matchups (${body.matchups.length}):`);
    for (const m of body.matchups) {
      console.log('   ', JSON.stringify(m));
    }
  }
  // Print the full body too, but truncated for noise control
  const json = JSON.stringify(body, null, 2);
  console.log(json.length > 2000 ? json.slice(0, 2000) + '\n  ... (truncated)' : json);
});

// Keep the script alive until killed
await new Promise(() => {});
