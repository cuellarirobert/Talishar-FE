// Attach to a running Chrome (launched with --remote-debugging-port=9222),
// find the lobby tab, and measure form/grid/footer/sticky-footer-height
// before and after toggling chat <-> matchups several times.
//
// Usage:
//   1. Quit Chrome completely.
//   2. Launch a new Chrome with the debug port:
//      open -a "Google Chrome" --args --remote-debugging-port=9222
//   3. Log in to Talishar and open a lobby with another player (or test client).
//   4. node scripts/inspect-lobby.mjs

import { chromium } from '@playwright/test';

const CDP = 'http://localhost:9222';

const measure = async (page, label) => {
  const data = await page.evaluate(() => {
    const round = (v) => Math.round(v * 10) / 10;
    const rect = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        h: round(r.height),
        bottom: round(r.bottom),
        marginBottom: cs.marginBottom,
        marginTop: cs.marginTop,
        paddingBottom: cs.paddingBottom,
        paddingTop: cs.paddingTop,
      };
    };
    const main = document.querySelector('main[class*="lobbyClass"]');
    const form = document.querySelector('form[class*="form"]');
    const grid = document.querySelector('div[class*="gridLayout"]');
    const chat = document.querySelector('div[class*="chatAreaContainer"]');
    const deck = document.querySelector('div[class*="deckSelectorContainer"]');
    const matchups = document.querySelector('article[class*="matchupContainer"]');
    const footer = document.querySelector('div[class*="stickyFooter"]');
    const cssVar = getComputedStyle(document.documentElement).getPropertyValue('--sticky-footer-height').trim();
    return {
      viewport: { w: window.innerWidth, h: window.innerHeight },
      stickyFooterVar: cssVar,
      main: rect(main),
      form: rect(form),
      grid: rect(grid),
      chat: rect(chat),
      deck: rect(deck),
      matchups: rect(matchups),
      footer: rect(footer),
      gap_grid_to_footer: footer && grid ? round(footer.getBoundingClientRect().top - grid.getBoundingClientRect().bottom) : null,
      gap_form_to_footer: footer && form ? round(footer.getBoundingClientRect().top - form.getBoundingClientRect().bottom) : null,
      gridClasses: grid?.className ?? null,
    };
  });
  console.log(`\n=== ${label} ===`);
  console.log(JSON.stringify(data, null, 2));
  return data;
};

const findToggle = async (page, kind) => {
  // kind: 'open-chat' (gold "Open Chat ▸" in compact mode)
  //       'matchups'  (gold "◂ Matchups" in expanded chat mode)
  //       'chat-from-matchups' (small "◂ Chat" button in matchups header)
  if (kind === 'open-chat') {
    return page.locator('button:has-text("Open Chat")').first();
  }
  if (kind === 'matchups') {
    return page.locator('button:has-text("◂ Matchups")').first();
  }
  if (kind === 'chat-from-matchups') {
    return page.locator('button:has-text("◂ Chat")').first();
  }
};

(async () => {
  const browser = await chromium.connectOverCDP(CDP);
  const contexts = browser.contexts();
  let lobbyPage = null;
  for (const ctx of contexts) {
    for (const p of ctx.pages()) {
      const url = p.url();
      if (url.includes('/game/lobby/') || url.includes('/lobby')) {
        lobbyPage = p;
        break;
      }
    }
    if (lobbyPage) break;
  }
  if (!lobbyPage) {
    console.error('No lobby tab found. Open the lobby in Chrome first.');
    console.error('Pages found:');
    for (const ctx of contexts) {
      for (const p of ctx.pages()) console.error('  -', p.url());
    }
    await browser.close();
    process.exit(1);
  }

  console.log('Attached to lobby:', lobbyPage.url());
  await lobbyPage.bringToFront();

  await measure(lobbyPage, 'INITIAL STATE');

  // Find what state we're in based on visible buttons
  const openChatBtn = await lobbyPage.locator('button:has-text("Open Chat")').count();
  const matchupsBtn = await lobbyPage.locator('button:has-text("◂ Matchups")').count();
  console.log(`\nButton presence: openChat=${openChatBtn}, matchups=${matchupsBtn}`);

  const sequence = [];
  if (openChatBtn) {
    sequence.push({ action: 'open-chat', label: 'AFTER click Open Chat' });
    sequence.push({ action: 'matchups', label: 'AFTER click Matchups' });
    sequence.push({ action: 'open-chat', label: 'AFTER click Open Chat (2nd)' });
    sequence.push({ action: 'matchups', label: 'AFTER click Matchups (2nd)' });
  } else if (matchupsBtn) {
    sequence.push({ action: 'matchups', label: 'AFTER click Matchups' });
    sequence.push({ action: 'open-chat', label: 'AFTER click Open Chat' });
    sequence.push({ action: 'matchups', label: 'AFTER click Matchups (2nd)' });
    sequence.push({ action: 'open-chat', label: 'AFTER click Open Chat (2nd)' });
  } else {
    console.log('Neither toggle visible. Probably matchups not loaded yet.');
  }

  for (const step of sequence) {
    const btn = await findToggle(lobbyPage, step.action);
    if (await btn.isVisible().catch(() => false)) {
      await btn.click();
      // wait for any transition (grid-template-columns is 0.25s)
      await lobbyPage.waitForTimeout(400);
      await measure(lobbyPage, step.label);
    } else {
      console.log(`Skipping ${step.action} — not visible`);
    }
  }

  await browser.close();
})();
