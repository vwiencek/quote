# quote

**Soft or Hard Picker** — a small static web app that helps you pick a random activity and time-box it.

## What the site does

1. You select the player at the top of the page: **Homme** or **Femme** (remembered between visits).
2. You pick a mode: **Soft** or **Hard**.
3. The page answers with:
   - a random activity matching your mode, filtered by player (entries marked `both` apply to everyone)
   - a random whole number of minutes drawn between that activity's `min` and `max`
4. A **countdown timer** starts from that duration down to `0:00`, so you can actually measure the time spent on the task. When it reaches zero the timer turns green and shows "Time's up!". The **+ 1 min** button next to the timer adds a minute (and restarts the countdown if time was already up).

Clicking a mode button again re-rolls the activity and restarts the timer.

## Where the data comes from

Activities are loaded at page load from a **Google Sheet** ([open](https://docs.google.com/spreadsheets/d/1eSbNFqS38as8rDRG5yLwZljaFEV1aUk-dR4_718YBMM/edit)), one entry per row with these columns:

| Column | Meaning |
|--------|---------|
| `gage` | The activity text |
| `player` | Who it applies to: `homme`, `femme`, or `both` |
| `min` / `max` | Duration bounds in minutes (a whole number is drawn in this range) |
| `type` | `soft` or `hard` |

Edit the sheet and refresh the page: no deploy needed.

The sheet must be shared as **"anyone with the link can view"** for the page to read it (it is fetched as CSV from the browser). A column-based layout (one `soft` column, one `hard` column) is also supported; those entries apply to both players with 2–10 minute durations. If the sheet is unreachable, the page shows an error and disables the buttons.

## Files

| File | Purpose |
|------|---------|
| `index.html` | The whole app (markup, styles, logic) |
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

Starts a temporary server, checks that `index.html` is served, and validates that the Google Sheet is reachable and contains `soft` and `hard` entries (needs network access). Exits non-zero on failure.

## Deployment

Every push to `main` deploys automatically to Azure Static Web Apps via the GitHub Actions workflow in `.github/workflows/`.
