# quote

**Soft or Hard Picker** — a small static web app that helps you pick a random activity and time-box it.

## What the site does

0. **PIN lock**: the app opens on an access-code screen (numeric keypad) and no content is shown until the correct 4-digit code is entered. The code is `1310` (constant `ACCESS_PIN` at the top of `app.js`). Once unlocked, the app stays open for the rest of the browser session (`sessionStorage`); closing the tab re-locks it.
1. You select the player at the top of the page (**♂ Lui / ♀ Elle**, remembered between visits).
2. Icon-only option toggles: **🔁** alternates the player automatically after each gage, **🙈** hides the remaining time (you don't know when it will ring) and **🔊** mutes/unmutes the end sound. All persisted.
3. You optionally narrow the pool with the **keyword filter chips** (all enabled by default; click to toggle). A **Tout / Rien** chip selects or clears them all at once.
4. You set the **intensity slider** (1–10) and press **GO**. The value is a **maximum**: the draw uses gages at that exact level, or falls back to the next level below when there are none (never above).
4. The page answers with:
   - a random activity at the highest available intensity ≤ the slider, filtered by player (entries marked `both` apply to everyone) and by the selected keywords
   - a random whole number of minutes drawn between that activity's `min` and `max`
5. A **countdown timer** is shown inside a **progress ring** coloured by the drawn gage's intensity (green → gold → red; green when done). It does **not** start on its own — the gage appears with the timer stopped (the ring gently pulses); **tap the ring to start it** (tap again to pause/resume), so you can measure the time spent on the task. When it reaches zero the timer turns green, shows "Time's up!", plays a short sound — a segment of `SF-cum.mp3` defined by the `END_SOUND_START` / `END_SOUND_END` constants (in seconds) at the top of `app.js` — and vibrates on mobile. Next to the timer, **⏸** pauses/resumes the countdown and **+ 1 min** adds a minute (and restarts the countdown if time was already up). The **🔀 Passer** button draws a different gage with the same settings, and **Terminé ✔** stops the timer early when the gage is done — same celebration (sound, vibration, green ring) — and the app waits for the next draw. The countdown is **wall-clock based**, so it stays accurate even if the tab is backgrounded (where browsers throttle timers).

Extra behavior:

- **No repeats**: drawn gages are remembered (localStorage) and not drawn again until the whole pool for the current selection has been used, then a new round starts automatically.
- **Screen stays awake** while the countdown runs (Screen Wake Lock API, where supported), so a phone doesn't lock mid-gage.
- **Sheet cache (stale-while-revalidate)**: the last CSV is kept in localStorage (keyed by sheet ID) and rendered instantly on load, then the sheet is always re-fetched in the background — if it changed, data and keyword chips refresh in place (keeping your selection) with a "données mises à jour" note; if the network is down, the page runs on the cached copy and says so.
- **Mis-tap protection**: while a timer runs, replacing the gage takes two clicks within 3 seconds.
- **Session score**: completed gages are counted per player ("Score : Lui X — Elle Y" at the bottom, ↺ to reset; one point max per gage). It's kept in `sessionStorage`, so it resets when you close the tab.
- **Read aloud**: a **🔈 Lire le gage** button reads the current gage out loud (click again to stop). It uses a natural **neural voice** via the `/api/tts` proxy when configured (see "Voice / TTS setup"), and otherwise falls back to the browser's built-in speech synthesis (offline-friendly).
- **Giant display**: tap (or focus + Enter/Space) the gage text to show it fullscreen (tap, or Escape, to close). Focus returns to the gage on close.
- **Accessible**: live regions announce the drawn gage, status and errors; the fullscreen view is keyboard-operable; visible keyboard focus throughout.
- **No external dependencies**: the Onest font is self-hosted (`assets/fonts/`), so there are no requests to Google Fonts and typography works fully offline.
- **PWA**: `manifest.json` + `sw.js` make the site installable on a phone's home screen (standalone, dice icon) and serve the app shell offline (network-first, cache fallback).

Clicking a mode button again re-rolls the activity and restarts the timer.

## Where the data comes from

Activities are loaded at page load from a **Google Sheet** ([open](https://docs.google.com/spreadsheets/d/1eSbNFqS38as8rDRG5yLwZljaFEV1aUk-dR4_718YBMM/edit)), one entry per row with these columns:

| Column | Meaning |
|--------|---------|
| `gage` | The activity text (any header containing "gage" works, e.g. `Gage détaillé`) |
| `player` | Who it applies to: `homme`, `femme`, or `both` |
| `min` / `max` | Duration bounds in minutes (a whole number is drawn in this range) |
| `keyword` | Filter tag(s) — one or several, comma-separated (e.g. `soft, romantic`). Each distinct tag becomes a filter chip; a gage is drawn when **any** of its tags is selected |
| `weight` | Optional draw weight (default 1) — higher = drawn more often |
| `intensité` | Intensity from 1 (mild) to 10 (extreme) — the slider draws among the gages closest to the chosen value. Rows without it are ignored |

Edit the sheet and refresh the page: no deploy needed.

The sheet must be shared as **"anyone with the link can view"** for the page to read it (it is fetched as CSV from the browser). If the sheet is unreachable, the page shows an error and disables the GO button.

## Files

| File | Purpose |
|------|---------|
| `index.html` | The markup |
| `styles.css` | The stylesheet |
| `app.js` | The logic |
| `manifest.json` / `sw.js` | PWA install + offline app shell |
| `assets/SF-cum.mp3` | Sound played when the timer ends |
| `assets/fonts/onest-latin.woff2` | Self-hosted Onest variable font (latin subset) |
| `assets/icon-*.png` | App icons (home screen / Apple touch) |
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

Starts a temporary server, checks that the page, PWA assets and mp3 are served, and validates the Google Sheet: reachable, has usable gage rows, and per-row sanity (intensité 1–10, player, min/max, weight). Incomplete rows that the app tolerates are reported as warnings; only real breakage fails the test.

## Voice / TTS setup (optional)

The read-aloud button works out of the box with the browser's built-in voice. For a much more natural **neural voice**, the app calls a tiny serverless proxy at `/api/tts` (`api/tts/`), an Azure Function that forwards the text to **Azure Neural TTS**. The subscription key stays server-side and never reaches the browser.

To enable it:

1. Create an **Azure AI Speech** resource (free tier: 500k characters/month) and note its **key** (either Key 1 or Key 2 works) and **region** (e.g. `westeurope`).
2. In the **Static Web App → Configuration → Application settings**, add:
   - `SPEECH_KEY` = the key
   - `SPEECH_REGION` = the region
   - `SPEECH_VOICE` (optional) = e.g. `fr-FR-DeniseNeural` (default), `fr-FR-HenriNeural`, `fr-FR-VivienneMultilingualNeural`
3. Save — the running function picks the settings up. (These are **runtime app settings**, not GitHub secrets; GitHub secrets are build-time only and won't reach the function.)

Until it's configured, `/api/tts` returns 503 and the app silently uses the browser voice. Never commit the key to the repo.

## Deployment

Every push to `main` deploys automatically to Azure Static Web Apps via the GitHub Actions workflow in `.github/workflows/`. The workflow's `api_location: "api"` also deploys the TTS function.
