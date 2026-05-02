# Lobby Redesign — Changelog

**Branch:** `bazaar-matchup-passthrough`
**Compare URL:** https://github.com/Talishar/Talishar-FE/compare/main...cuellarirobert:bazaar-matchup-passthrough

## Blast radius

All changes are confined to the **lobby route** (`src/routes/game/lobby/`).

- Every changed CSS file is a CSS Module (`*.module.css`). Class names are hashed per-file at build time, so the styles cannot leak to other parts of the app even if the same class names exist elsewhere.
- Every changed React component (`Equipment`, `LobbyChat`, `StickyFooter`, `Matchups`) is consumed **only by `Lobby.tsx`**. Verified via codebase-wide grep — no other file imports any of them.
- No global CSS, no SCSS partials, no theme files, no `index.scss`, no shared utility classes were touched.
- One new dependency: `@playwright/test` (devDependency only — used for the local CDP-attached debugging scripts under `scripts/`. Does not ship to production.)

## Files changed (vs `origin/main`)

### `src/routes/game/lobby/Lobby.tsx`

The route shell. The following functional additions were made:

1. **`chatExpanded` state** — controls whether the left chat column is in compact mode (chat log + quick-chat chips + "Open Chat ▸" button) or expanded mode (full `<LobbyChat />` with All/Chat/Log tabs). Toggle button lives in the panel headers, never in the nav bar.
2. **`MiniChatLog` component** (added at bottom of the file) — a compact, scrollable chat log used in compact mode. Reads `state.game.chatLog` from Redux, filters to actual chat messages via the regex `COMPACT_CHAT_RE` (`<span[^>]*>(.*?):\s<\/span>/`), renders via `parseHtmlToReactElements`, auto-scrolls to bottom.
3. **`LOBBY_PRESETS` constant** — list of 6 preset chat IDs (Hello, GLHF, BRB, Undo?, No prob!, Chat?) wired to `useSendGameChat` for the pill-chip strip.
4. **`hasMatchups` state** + **`shouldShowMatchupsUI` derivation** — drives whether the matchups grid column is rendered. Mirrors `gameLobby.matchups.length > 0` reactively.
5. **`<Matchups>` JSX gate updated** — only renders when `shouldShowMatchupsUI && (activeTab === 'matchups' || (isWideScreen && !chatExpanded))`. Now also passes `format={data.format}` and `isBazaarDeck={isBazaarDeckInLobby}` props.
6. **The compact-chat block** is rendered conditionally: `isWideScreen && !chatExpanded && hasMatchups`.
7. **`<div className={styles.spacer}></div>`** is left in place (existing) — it's a no-op div now that we use a CSS variable for the footer height.
8. **No nav bar changes.** The `<nav>` block is structurally identical to upstream — buttons, classNames, and ordering are preserved. This was a hard requirement throughout the redesign.

### `src/routes/game/lobby/Lobby.module.css`

CSS Module for the route shell.

1. **`.lobbyClass` (widescreen, `min-width: 1200px`)** — `bottom: 110px` → `bottom: var(--sticky-footer-height, 80px)`. The hardcoded 110px was a phantom band leftover from when the footer was taller. Now keyed off the StickyFooter's measured height (see below).
2. **`.form` (NEW base rule)** — `margin: 0`. Pico CSS adds a default `margin-bottom` to every `<form>` element (intended for spacing between forms in normal page flow). Since the lobby `<form>` is the entire layout container, that 70px margin was being subtracted from the available height and creating a black band above the footer. This override neutralizes it.
3. **`.form` (widescreen)** — switched from `min-height: 100%` to explicit `height: 100%; width: 100%; margin: 0; display: flex; flex-direction: column`. The `min-height: 100%` cascade was producing an indeterminate height through the flex chain, leaving the grid 134px short of `lobbyClass`.
4. **`.gridLayout` (widescreen)** — switched from `min-height: 100%` to `flex: 1 1 auto; min-height: 0`. Same root cause as #3.
5. **`.gridLayout` template areas:**
   - Default: `'chat heroes matchups' / 'chat weapons matchups'` (3 columns, 180px / 1fr / 360px)
   - `.noMatchups`: `'chat heroes' / 'chat weapons'` (2 columns)
   - `.chatExpanded`: same areas as default but columns become `380px 1fr 0px` so the matchups column collapses
   - Transition: `grid-template-columns 0.25s ease`
6. **`.chatAreaContainer` / `.chatAreaContainerRestrained` (widescreen)** — added `height: 100%; align-self: stretch; padding: 0.75rem 0.5rem 0`. The padding-top gives the gold "◂ Matchups" toggle button breathing room from the viewport top.
7. **`.deckSelectorContainer` (widescreen)** — added `height: 100%; align-self: stretch; min-height: 0`. So Equipment's internal `flex: 1` can actually fill.
8. **`.titleContainer`** — moved from `grid-area: hero` (sticky) to `grid-area: heroes` (top-center, height 120px, `position: relative`). Hero portraits are now in the center column, independent of chat column width.
9. **`.leftCol`, `.rightCol`** — `background-position: center 15%` so we see the top of the hero card art (face) instead of the middle (torso).
10. **`.compactChat`, `.compactChatHeader`, `.compactChatLog`, `.compactChatEmpty`** (NEW) — styles for the compact-mode chat column. Header has a small gold accent bar on the left (matches the "Open Chat ▸" gold theme), chat log has a gradient background, message-row dividers, custom thin scrollbar.
11. **`.quickChatStrip`, `.quickChatChip`** (NEW) — pill-shaped preset chips with gold hover state.
12. **`.chatExpandBtn`** (NEW) — full-width gold "Open Chat ▸" button in compact mode.
13. **`.chatToggleBtn`** (NEW) — full-width gold "◂ Matchups" toggle in expanded chat mode.
14. **`.deckCount`, `.deckErrorIcon`, `.deckErrorTooltip`, `@keyframes pulseWarning`** moved to `StickyFooter.module.css` (see below).

### `src/routes/game/lobby/components/stickyFooter/StickyFooter.tsx`

1. **`ResizeObserver` added inside the `useEffect`** — keeps `--sticky-footer-height` accurate when the footer's content changes (sync chip text, deck error icon visibility, deck count overflow). Previously the variable was only measured once on mount + on window resize, so any footer-height delta during a chat-expand toggle re-introduced a phantom band.
2. **Removed the growing `footerAlarm` banner** that pushed the footer taller when the deck was invalid. Replaced with an inline pulsing warning icon next to "Deck N/60" (see CSS below).
3. **`<FaExclamationCircle />` icon** + **`<span className={styles.deckErrorTooltip}>{errorArray[0]}</span>`** — the icon is hover-revealable; the tooltip shows the first validation error.

### `src/routes/game/lobby/components/stickyFooter/StickyFooter.module.css`

1. **Removed grid template area `'. . . . alarm alarm'`** (the second row of the footer for the alarm banner).
2. **Removed `.footerAlarm`, `.alarm`, and the mobile overrides for those classes.**
3. **Added `@keyframes pulseWarning`** — 1.6s ease-in-out infinite, opacity 0.45 ↔ 1.0.
4. **Added `.deckCount`** — flex container for the icon + "Deck N/60" text.
5. **Added `.deckErrorIcon`** — pulsing amber (`#E67E22`) warning icon, animation pauses on hover.
6. **Added `.deckErrorTooltip`** — absolute-positioned tooltip above the icon, opacity 0 by default, opacity 1 on parent `:hover`.

### `src/routes/game/lobby/components/lobbyChat/LobbyChat.module.css`

The `LobbyChat` component (consumed only by `Lobby.tsx`) was sized via a hardcoded viewport calculation that no longer matches the new grid:

1. **`.container`** — `height: calc(100dvh - 440px)` → `flex: 1; min-height: 0`. Now fills its parent rather than guessing at the viewport. Also removed `grid-area: chat` (it's nested inside `chatAreaContainer`, not a direct grid child anymore) and `align-items: flex-end` (was anchoring content to the right; we want it to fill the column).
2. **Tablet / small-screen rule** preserved with `flex: 0 0 auto` so the explicit `height: calc(100dvh - 380px)` still applies in those breakpoints.

### `src/routes/game/lobby/components/equipment/Equipment.module.css`

Two-line addition:

1. **`.container`** — added `flex: 1; min-height: 0`. The container already had `overflow-y: auto`, but without `flex: 1` it didn't claim the available space inside its (now flex-column) parent, so when chat was expanded and the deck column narrowed, the Legs cards were getting clipped instead of becoming scrollable. With the addition, internal scrolling activates correctly.

### `src/routes/game/lobby/components/matchups/Matchups.tsx`

Significant restructure. The component is consumed only by `Lobby.tsx`.

1. **New props:** `format?: string`, `isBazaarDeck?: boolean`, `onExpandChat?: () => void`.
2. **`HERO_BY_ID` and `HERO_BY_NAME` lookup maps** built from `HEROES_OF_RATHE`. Used by `resolveHero(matchup)` to determine whether a given matchup conceptually targets a known hero. Falls back to name-based lookup so backends that send `matchupId='arakni_huntsman'` (slug) but `name='Arakni Huntsman'` still get matched.
3. **`{ savedHeroMatchups, customMatchups }` partition** of `gameLobby.matchups` — anything that resolves to a hero goes into `savedHeroMatchups`, everything else into `customMatchups`. Source-agnostic: works for FaB Bazaar, Fabrary, FabDB, or any other deckbuilder that posts to the lobby endpoint.
4. **`unsavedHeroes`** — for Bazaar decks only, this is the format-legal `HEROES_OF_RATHE` minus any hero already in `savedHeroMatchups`. Renders as the grayscale discovery grid below SAVED PROFILES. (For non-Bazaar decks, this list is empty so the grid section doesn't render.)
5. **Format filter** — `BLITZ_FORMATS` set in the file determines whether to show young or adult heroes. Includes `BLITZ`, `COMPETITIVE_BLITZ`, `OPEN_BLITZ`, `SAGE`, `COMPETITIVE_SAGE`, `OPEN_SAGE`, `COMMONER`. **Note:** does NOT yet filter banned heroes — open question for backend integration.
6. **`HERO_CLASS_MAP` extended** to ~60 heroes covering all current sets (Nuu→Assassin, Enigma→Illusionist, Dromai→Runeblade, Cindra→Runeblade, Fang→Ninja, Riptide→Ranger, etc.).
7. **`CLASS_ORDER`** drives the section order: Assassin, Brute, Guardian, Illusionist, Mechanologist, Necromancer, Ninja, Pirate, Ranger, Runeblade, Warrior, Wizard, Other.
8. **Search input** — filters across both saved-hero matchups (by `matchup.name ?? hero.label`), custom matchups (by `m.name ?? m.matchupId`), and unsaved heroes (by hero label).
9. **Click behavior:**
   - Configured matchup (hero or custom) → `handleMatchupClick(matchupId)` (existing API call to `joinGameMutation`)
   - Unsaved hero portrait (Bazaar discovery only) → opens an anchored popover next to the clicked hero, NOT a centered modal
10. **`NoDataPopover` component** — small (260px wide) pop-up with hero name, brief explainer ("Save one in your deckbuilder to auto-apply sideboard adjustments"), and a "Learn more ↗" link to FaB Bazaar's tutorial. Anchored to the click position with auto-flip if it would go off-screen. Closes on outside click or close `×`.
11. **`type="button"`** added to all matchup card buttons. Without this, in a `<form>` context they default to `type="submit"`, which was triggering form-focus scroll on click.

### `src/routes/game/lobby/components/matchups/Matchups.module.css`

1. **`.matchupContainer`** — added `margin: 0` and `height: 100%`, removed `max-height: calc(100vh - 120px)`. The article's pico-default 40px top + 40px bottom margin was the **single biggest visual bug** of the redesign — because the article is a CSS Grid item with margins, the row track was sized to accommodate them, and that propagated to the chat & deck sibling columns, making them stop 40px short of the footer. Removing `max-height` and zeroing the margin fixed all three columns at once.
2. **`.namedMatchupList`, `.namedMatchupItem`, `.namedMatchupSelected`, `.namedMatchupName`, `.namedMatchupBadge`** (NEW) — full-width row buttons for custom-named matchups (Aggro, Mirror, "happydays3", etc.). Gold hover state, "1st"/"2nd" badge on the right.
3. **`.portraitImg`, `.portraitImgHasData`** — grayscale by default, full color when the hero has saved data (`portraitImgHasData` class is applied conditionally).
4. **`.matchupHeader`, `.chatToggleBtn`** (NEW) — header now has a "◂ Chat" toggle to switch back to expanded chat mode (only shown when `onExpandChat` is provided).
5. **`.noDataBackdrop`, `.noDataPopover`, `.noDataTitle`, `.noDataBody`, `.noDataLearnLink`, `.noDataCloseX`** + popover positioning pseudo-element (`::before` arrow that flips between left/right placement) — see #10 in `Matchups.tsx`.
6. **Tablet / mobile media query** preserves the existing horizontal-strip layout for screens < 1200px.

### `package.json` / `package-lock.json`

- Added `@playwright/test` as a **devDependency** only. Does not affect the production bundle. Kept long-term — the scripts/ directory below is the seed of a regression test suite (see "Open items").

### `scripts/` (NEW)

Local debugging utilities — none of these are bundled or referenced by the app. They attach to a running Chrome over CDP (`--remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug`) and exercise the lobby in real time.

- `inspect-lobby.mjs` — measures form/grid/footer/column dimensions before & after toggling chat ↔ matchups. Used to track down the "phantom band" issue. Doubles as a layout regression check (assertable: `gap_grid_to_footer ≤ 1px`, `chat.bottom == deck.bottom`, etc.).
- `screenshot-chat.mjs` — captures a screenshot of just the compact chat column. Useful for visual regression review.
- `test-no-matchup-popover.mjs` — clicks a grayscale hero and verifies the popover anchoring (vertical-center alignment with the clicked portrait, off-screen flip behavior).
- `popover-zoom.mjs` — zoomed screenshot of the popover + adjacent portrait.

**These should be kept.** They're the foundation for a proper Playwright test suite (see "Open items").

## Open items / not addressed

These came up during the redesign but were left for follow-up:

1. **Banned-hero filtering** — `Matchups.tsx` filters by young/adult only. Heroes that are banned in the current format (e.g. Briar in CC at the time of this writing) still appear in the discovery grid. Needs a hero ban list — most likely surfaced by the backend on the lobby payload.
2. **Nav bar simplification** — was discussed but explicitly **not** done; the `<nav>` is structurally identical to upstream. The `Filters / Select All / Select None` row is unchanged.
3. **Promote `scripts/` into a proper Playwright e2e test suite.** Concrete plan:
   - Add `playwright.config.ts` at repo root (single Chromium project, `baseURL: http://localhost:5173`, viewport `1920x968` to match the widescreen breakpoint we redesigned for).
   - Move ad-hoc scripts into `e2e/lobby/` as proper `test()` blocks with `expect()` assertions.
   - Use Playwright's `page.route()` to intercept lobby API calls and seed deterministic fixtures (Bazaar deck w/ saved hero matchups, Bazaar deck w/ no matchups, fabrary deck w/ named matchups, mixed, empty). This sidesteps the "lobby requires a live game" problem.
   - Suggested initial regression tests:
     - Layout: grid bottom touches footer top (`gap_grid_to_footer < 2px`) in default + chat-expanded modes
     - Chat toggle: clicking "Open Chat ▸" sets `.chatExpanded` class; clicking "◂ Matchups" removes it
     - Matchups partition: configured hero matchup renders as portrait in SAVED PROFILES, NOT in the discovery grid below
     - Popover: clicking a grayscale hero opens a popover anchored to that hero (vertical-center alignment within 2px, popover stays in viewport)
     - StickyFooter: deck-error icon pulses when deck is invalid, hides when valid
     - Form margin: `getComputedStyle(form).marginBottom === '0px'` (regression test for the pico bug)
4. **Banned-hero filtering** — see #1 above.

## How to revert any single piece

Because every CSS change is module-scoped and every component change is consumed only by `Lobby.tsx`, you can cherry-revert individual concerns without touching the rest:

- **Just the matchups partition** → revert `Matchups.tsx` + `Matchups.module.css`
- **Just the compact chat** → revert the `MiniChatLog` block in `Lobby.tsx` + `compactChat*`/`quickChat*`/`chatExpandBtn`/`chatToggleBtn` rules in `Lobby.module.css`
- **Just the inline error icon** → revert `StickyFooter.tsx` + `StickyFooter.module.css`
- **Just the layout fix (full-height grid, no phantom band)** → revert the `.lobbyClass`, `.form`, `.gridLayout`, `.deckSelectorContainer`, `.chatAreaContainer*`, and `.matchupContainer` margin/height rules
