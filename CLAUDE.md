# OSRS Tools

An installable mobile-first PWA (Progressive Web App) of personal Old School RuneScape (OSRS) tools for one account. Formerly "Boss Kill Tracker". No backend, no build step — pure static HTML/CSS/JS.

## What it does

Bottom tabs are **Home** and **Settings**. Home shows a tile per tool; tools open full-screen with a "‹ Home" back button in the header.

- **Boss Tracker** (tool): segmented Today / Calendar sub-views.
  - **Today**: the bosses the user has added, with kill count vs. daily goal, a progress bar, and +/− steppers / quick-add. Groups ("sum" or "either" mode) render as combined cards.
  - **Calendar**: month grid with a dot per day (none / partial / all goals complete); tap a day for a modal with that day's boss list.
- **Hours to Max** (tool): hours until 99 in every skill (24 skills incl. Sailing, 13,034,431 XP each) using the user's own flat xp/h rate per skill. Shows a "I play N hours a day → max date" card, a total-hours summary with a stacked bar, and skill rows ranked by hours. Skills at 99 are hidden; skills below 99 with no rate are listed but excluded from the total.
- **Settings**: Account & xp/h Rates (RSN, Sync button, rates table), My Bosses / My Groups / Add a Boss, and Backup (export/import JSON).

## Architecture

- `index.html` — single page shell (header, tab bar, view root, modal root).
- `app.js` — all UI logic, vanilla JS, no framework, no build step. Renders views by setting `innerHTML` and wiring event listeners.
- `db.js` — thin `DB` wrapper around IndexedDB (`osrsToolsDB`). Data from the old "Boss Kill Tracker" database (`bossTrackerDB`) is not migrated; move it with Export/Import. Stores:
  - `bosses`: `{ id, name, image, goal, order }`
  - `kills`: keyed by `` `${date}_${bossId}` ``, `{ key, date, bossId, count }`
  - `groups`: `{ id, name, bossIds, mode: "sum"|"either", goal, memberGoals, order }`
  - `meta`: key/value (`{ key, value }`) for Hours to Max — `rsn`, `rates` (`{ skillKey: xpPerHour }`), `stats` (`{ skills: { skillKey: xp }, displayName, syncedAt, snapshotAt }`), `pace` (hours/day).
- `sw.js` — service worker; cache-first strategy for same-origin GETs only, precaches the app shell and all boss images for offline use. Cross-origin requests (Wise Old Man API) bypass it. Bump `CACHE_NAME` when precached assets change.
- `manifest.json` — PWA manifest (installable, standalone display, portrait).
- `assets/bosses/*.png` + `assets/bosses/manifest.json` — the boss image catalog (name + image filename) used to populate the "Add a Boss" search list in Settings.
- `scripts/boss_list.tsv` + `scripts/download_images.sh` — one-off tooling to (re)generate the boss catalog: downloads each boss's wiki thumbnail, resizes to 200px wide, and rebuilds `assets/bosses/manifest.json`. Not run automatically; run manually when adding/updating bosses.

## Stats source: Wise Old Man

- Stats come from the Wise Old Man API v2 (`https://api.wiseoldman.net/v2/players/{rsn}`), which allows browser (CORS) requests and needs no API key. The official OSRS hiscores endpoint can't be used: it sends no CORS headers, so a static site can't call it.
- Sync is manual only (Settings → Sync, or Refresh on Hours to Max) and only `GET`s WOM's latest saved snapshot. The app deliberately never `POST`s (which would make WOM refresh from the official hiscores); the user updates their player on wiseoldman.net when they want newer data. Unauthenticated limit is ~20 req/min. Skills are read from `latestSnapshot.data.skills.<key>.experience` (`-1` = unranked, stored as 0).
- The last synced stats are kept in the `meta` store so Hours to Max works offline.

## Data model notes

- All data is local to the device (IndexedDB) — there is no server sync. Export/Import (Settings) is the only backup mechanism, producing/consuming a JSON file with `{ version: 3, exportedAt, bosses, kills, groups, meta }`. Importing an older backup without `meta` keeps the current RSN/rates/stats.
- A kill count of 0 deletes the `kills` row rather than storing a zero (`DB.setKill`).
- Adding a boss to "My Bosses" is separate from the read-only catalog in `assets/bosses/manifest.json` — the catalog is the full list of known OSRS bosses; a user's tracked bosses are a subset stored in the `bosses` IndexedDB store.

## Deployment

- Hosted on GitHub Pages (static hosting, serves straight from the repo). The live app is used on a phone via "Add to Home Screen," so it runs as an installed PWA, not in a normal browser tab.
- For local development, serve the directory with any static file server rather than opening `index.html` via `file://` — the app fetches `assets/bosses/manifest.json` and registers `sw.js`, both of which require `http(s)://`:
  ```bash
  python3 -m http.server 8000
  ```
  Then open `http://localhost:8000` in a browser.

## Working in this repo

- No package.json, no build/bundle step, no test suite — edit `app.js`/`db.js`/`style.css` directly and verify against a local static server (see Deployment above).
- If you add/remove files that should work offline, update `PRECACHE_URLS` in `sw.js` and bump `CACHE_NAME`.
- If you change the boss catalog, regenerate via `scripts/download_images.sh` (reads `scripts/boss_list.tsv`, writes `assets/bosses/*.png` + `assets/bosses/manifest.json`), then update `sw.js`'s precache list to include any new image files.
