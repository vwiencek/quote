# quote

**Soft or Hard Picker** — a small static web app that helps you pick a random activity and time-box it.

## What the site does

0. **PIN lock**: the app opens on an access-code screen (numeric keypad) and no content is shown until the correct 4-digit code is entered. The code is `1310` (constant `ACCESS_PIN` at the top of `app.js`). Once unlocked, the app stays open for the rest of the browser session (`sessionStorage`); closing the tab re-locks it.
1. You select the player at the top of the page (♂ / ♀ icons, remembered between visits). The **🔁 chacun son tour** toggle alternates the player automatically after each gage.
2. Option toggles: **🔥 intensité** (Surprise draws lean more and more towards hard as the session goes on, 20% → 85%), **🙈 temps caché** (the countdown and ring are masked — you don't know when it will ring) and **🔊 son** (mute/unmute the end sound). All persisted.
3. You optionally narrow the pool with the **keyword filter chips** (all enabled by default; click to toggle).
4. You pick a level: **Soft**, **Hard** — or **Surprise**, which picks one at random (weighted by 🔥 when enabled).
4. The page answers with:
   - a random activity matching your level, filtered by player (entries marked `both` apply to everyone) and by the selected keywords
   - a random whole number of minutes drawn between that activity's `min` and `max`
5. A **countdown timer** starts from that duration down to `0:00` inside a **progress ring** (blue for soft, pink for hard, green when done), so you can actually measure the time spent on the task. When it reaches zero the timer turns green, shows "Time's up!", plays a short sound — a segment of `SF-cum.mp3` defined by the `END_SOUND_START` / `END_SOUND_END` constants (in seconds) at the top of the script in `index.html` — and vibrates on mobile. Next to the timer, **⏸** pauses/resumes the countdown and **+ 1 min** adds a minute (and restarts the countdown if time was already up). The **Terminé ✔** button below stops the timer early when the gage is done — same celebration (sound, vibration, green ring) — and the app waits for the next draw.

Extra behavior:

- **No repeats**: drawn gages are remembered (localStorage) and not drawn again until the whole pool for the current selection has been used, then a new round starts automatically.
- **Screen stays awake** while the countdown runs (Screen Wake Lock API, where supported), so a phone doesn't lock mid-gage.
- **Sheet cache (stale-while-revalidate)**: the last CSV is kept in localStorage (keyed by sheet ID) and rendered instantly on load, then the sheet is always re-fetched in the background — if it changed, data and keyword chips refresh in place (keeping your selection) with a "données mises à jour" note; if the network is down, the page runs on the cached copy and says so.
- **Mis-tap protection**: while a timer runs, replacing the gage takes two clicks within 3 seconds.
- **Session score**: completed gages are counted per player ("Score : Lui X — Elle Y" at the bottom, ↺ to reset; one point max per gage).
- **Giant display**: tap the gage text to show it fullscreen (tap again to close).
- **PWA**: `manifest.json` + `sw.js` make the site installable on a phone's home screen (standalone, dice icon) and serve the app shell offline (network-first, cache fallback).

Clicking a mode button again re-rolls the activity and restarts the timer.

## Where the data comes from

Activities are loaded at page load from a **Google Sheet** ([open](https://docs.google.com/spreadsheets/d/1eSbNFqS38as8rDRG5yLwZljaFEV1aUk-dR4_718YBMM/edit)), one entry per row with these columns:

| Column | Meaning |
|--------|---------|
| `gage` | The activity text |
| `player` | Who it applies to: `homme`, `femme`, or `both` |
| `min` / `max` | Duration bounds in minutes (a whole number is drawn in this range) |
| `keyword` | Filter tag — the unique values become the filter chips on the page |
| `weight` | Optional draw weight (default 1) — higher = drawn more often |
| `level` | `soft` or `hard` (the legacy `type` header is also accepted) |

Edit the sheet and refresh the page: no deploy needed.

The sheet must be shared as **"anyone with the link can view"** for the page to read it (it is fetched as CSV from the browser). A column-based layout (one `soft` column, one `hard` column) is also supported; those entries apply to both players with 2–10 minute durations. If the sheet is unreachable, the page shows an error and disables the buttons.

## Files

| File | Purpose |
|------|---------|
| `index.html` | The markup |
| `styles.css` | The stylesheet |
| `app.js` | The logic |
| `SF-cum.mp3` | Sound played when the timer ends |
| `manifest.json` / `sw.js` | PWA install + offline app shell |
| `icon-*.png` | App icons (home screen / Apple touch) |
| `serve.sh` | Start a local server to preview the site |
| `test.sh` | Smoke-test the site locally |

## Run locally

```sh
./serve.sh          # serves http://localhost:8001
./serve.sh 3000     # or pick another port
```

Then open <http://localhost:8001>. Edit `index.html` and refresh — no build step.

## Test

```sh
./test.sh
```

Starts a temporary server, checks that the page, PWA assets and mp3 are served, and validates the Google Sheet: reachable, contains `soft` and `hard` entries, and per-row sanity (level, player, min/max, keyword). Incomplete rows that the app tolerates are reported as warnings; only real breakage fails the test.

## Deployment

Every push to `main` deploys automatically to Azure Static Web Apps via the GitHub Actions workflow in `.github/workflows/`.
