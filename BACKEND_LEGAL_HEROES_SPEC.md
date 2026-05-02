# Backend Spec: `legalHeroes` field on Lobby payload

## Goal

Move format-aware hero filtering (legality + class) out of the FE constants and into the Talishar backend, where the source-of-truth data already lives. The FE side has been updated to consume the new field with a graceful fallback to its current static constants when absent — so the backend change can ship at any time without breaking existing clients.

## Field

Add a single optional field to the `GetLobbyInfo` and `GetLobbyRefresh` response payloads:

```json
{
  // ...existing lobby fields...
  "legalHeroes": [
    { "heroId": "briar_warden_of_thorns", "name": "Briar Warden of Thorns", "class": "RUNEBLADE" },
    { "heroId": "viserai_rune_blood",     "name": "Viserai Rune Blood",     "class": "RUNEBLADE" },
    { "heroId": "katsu_the_wanderer",     "name": "Katsu the Wanderer",     "class": "NINJA" }
  ]
}
```

### Field shape (TypeScript / FE-side type)

```ts
interface LegalHero {
  heroId: string;   // slug, e.g. "briar_warden_of_thorns"
  name: string;     // display name with proper casing, e.g. "Briar Warden of Thorns"
  class: string;    // class name from CardClass(): "RUNEBLADE", "WIZARD", "ASSASSIN", etc.
  young?: boolean;  // optional; backend has already format-filtered, FE doesn't re-filter
}
```

The FE will rely on the backend to:
- Apply the format's young/adult split (`young = true` for Blitz/Sage/Commoner, `young = false` for CC/etc.)
- Apply the format's hero ban list (`isBannedInFormat` in `JoinGame.php` line 829)
- Tag each hero with its class (via `CardClass()` in `CardDictionary.php` line 404)

## Where to construct the list

Both `APIs/GetLobbyInfo.php` and `APIs/GetLobbyRefresh.php` build the response payload that becomes `gameLobby`. The legal-heroes computation should happen there (or in a shared helper), because:

1. The format is known at request time (from the deck being loaded).
2. `isBannedInFormat($cardID, $format)` and `CardClass($cardID)` are already loaded as functions.
3. The hero universe is small (~80 heroes total in `HEROES_OF_RATHE` constant) — a single linear pass per request is cheap.

## Suggested implementation sketch (PHP)

```php
// somewhere callable from both GetLobbyInfo.php and GetLobbyRefresh.php
function GetLegalHeroes($format) {
  global $livingLegends, $benched;

  // Source of truth for the hero universe. This list currently lives in the FE's
  // src/routes/index/components/filter/constants.ts as HEROES_OF_RATHE. It would
  // be cleaner to mirror it here, or generate both from a shared JSON/CSV.
  $allHeroes = [
    ['heroId' => 'rhinar_reckless_rampage',     'name' => 'Rhinar Reckless Rampage',     'young' => false],
    ['heroId' => 'rhinar',                       'name' => 'Rhinar',                       'young' => true],
    ['heroId' => 'bravo_showstopper',            'name' => 'Bravo Showstopper',            'young' => false],
    // ... ~80 entries total
  ];

  $useYoung = in_array($format, [
    'blitz', 'compblitz', 'openblitz',
    'sage', 'compsage', 'opensage',
    'commoner',
  ]);

  $legal = [];
  foreach ($allHeroes as $h) {
    if ($h['young'] !== $useYoung) continue;       // wrong tier for this format
    if (IsCardBanned($h['heroId'], $format, $h['heroId'])) continue;  // banned in this format
    $legal[] = [
      'heroId' => $h['heroId'],
      'name'   => $h['name'],
      'class'  => CardClass($h['heroId']),         // returns "RUNEBLADE" / "WIZARD" / etc.
    ];
  }
  return $legal;
}
```

Then in the response:

```php
$response['legalHeroes'] = GetLegalHeroes($format);
```

## Single source of truth for the hero list

The `$allHeroes` array in PHP duplicates `HEROES_OF_RATHE` in FE. Three options for keeping them in sync:

1. **Define on backend, drop FE constant entirely** — once the new field is shipping, `HEROES_OF_RATHE` becomes dead code. FE can be updated to remove it (the fallback path in `Matchups.tsx`).
2. **Generate both from one source** — JSON/YAML/CSV file of heroes that's the input to a code-gen step for both. More upfront work, eliminates drift forever.
3. **Live with the duplication** — easiest, but requires updating both files when a new hero set ships.

Recommend #1: ship the backend field, then remove the FE fallback in a second PR.

## FE consumer (already implemented)

`src/routes/game/lobby/components/matchups/Matchups.tsx` already prefers `gameLobby.legalHeroes` over the static `HEROES_OF_RATHE` import when the field is present and non-empty. Specifically:

- `heroSource` (line ~115) prefers `gameLobby.legalHeroes` if present, falls back to `HEROES_OF_RATHE`.
- `unsavedHeroes` (line ~177) prefers `gameLobby.legalHeroes` for the discovery grid; falls back to `HEROES_OF_RATHE.filter(young)` (which doesn't ban-filter — known limitation of the fallback).
- `groupedMatchups` (line ~232) prefers backend-supplied `class` for grouping; falls back to FE's `HERO_CLASS_MAP`.

So once the backend field ships, the FE will start filtering banned heroes correctly with no further FE changes required.

## Testing the rollout

After backend ships, before removing the FE fallback, verify in browser DevTools or via the sniffer (`scripts/sniff-lobby-api.mjs`):

1. Load a CC deck. Inspect `gameLobby.legalHeroes` — confirm `briar_warden_of_thorns` etc. are NOT in the list (they're LL → banned in CC).
2. Load a Blitz deck. Confirm only young heroes appear (`rhinar`, `dorinthea`, `bravo`, etc., not `bravo_showstopper`).
3. Load a Commoner deck. Confirm young heroes only, banned heroes excluded.
4. In the lobby UI matchups panel, verify the "ASSASSIN" / "BRUTE" / etc. groups match the backend's `class` strings (mapped to title-case for display).
