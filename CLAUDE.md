# OSRS Boss Tracker

A installable mobile-first PWA (Progressive Web App) for tracking daily Old School RuneScape (OSRS) boss kills against personal daily goals. No backend, no build step — pure static HTML/CSS/JS.

## What it does

- **Today tab**: shows the bosses the user has added, with a kill count vs. daily goal, a progress bar, and +/− steppers / quick-add for logging kills.
- **Calendar tab**: month grid with a dot per day indicating none / partial / all-goals-complete, tap a day to open a modal with that day's boss list (same card UI as Today).
- **Settings tab**: manage "My Bosses" (edit daily goal, remove), add new bosses from a searchable catalog of all OSRS bosses, and export/import a full JSON backup of all data.

## Architecture

- `index.html` — single page shell (header, tab bar, view root, modal root).
- `app.js` — all UI logic, vanilla JS, no framework, no build step. Renders views by setting `innerHTML` and wiring event listeners.
- `db.js` — thin `DB` wrapper around IndexedDB (`bossTrackerDB`). Two object stores:
  - `bosses`: `{ id, name, image, goal, order }`
  - `kills`: keyed by `` `${date}_${bossId}` ``, `{ key, date, bossId, count }`
- `sw.js` — service worker; cache-first strategy, precaches the app shell and all boss images for offline use. Bump `CACHE_NAME` when precached assets change.
- `manifest.json` — PWA manifest (installable, standalone display, portrait).
- `assets/bosses/*.png` + `assets/bosses/manifest.json` — the boss image catalog (name + image filename) used to populate the "Add a Boss" search list in Settings.
- `scripts/boss_list.tsv` + `scripts/download_images.sh` — one-off tooling to (re)generate the boss catalog: downloads each boss's wiki thumbnail, resizes to 200px wide, and rebuilds `assets/bosses/manifest.json`. Not run automatically; run manually when adding/updating bosses.

## Data model notes

- All data is local to the device (IndexedDB) — there is no server sync. Export/Import (Settings tab) is the only backup mechanism, producing/consuming a JSON file with `{ version, exportedAt, bosses, kills }`.
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
