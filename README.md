# quote

**Soft or Hard Picker** — a small static web app that helps you pick a random activity and time-box it.

## What the site does

1. You pick a mode: **Soft** or **Hard**.
2. The page answers with:
   - a random activity from the list matching your mode
   - a random duration between **2 and 10 minutes**
3. A **countdown timer** starts from that duration down to `0:00`, so you can actually measure the time spent on the task. When it reaches zero the timer turns green and shows "Time's up!". The **+ 1 min** button next to the timer adds a minute (and restarts the countdown if time was already up).

Clicking a mode button again re-rolls the activity and restarts the timer.

## Where the data comes from

Activities are loaded at page load, in this order:

1. **Google Sheet** [`quote-activities`](https://docs.google.com/spreadsheets/d/1eukn-3n_L_6bDl1u_1L3UQpdtpK19ZijChwATly6lQA/edit) — two columns, `soft` and `hard`, one activity per row. Edit the sheet and refresh the page: no deploy needed.
   The sheet must be shared as **"anyone with the link can view"** for the page to read it (it is fetched as CSV from the browser).
2. **`quotes.json`** (fallback) — used automatically when the sheet is unreachable or malformed.

The browser console says which source was used.

## Files

| File | Purpose |
|------|---------|
| `index.html` | The whole app (markup, styles, logic) |
| `quotes.json` | Fallback activity lists, used when the Google Sheet is unreachable |
| `serve.sh` | Start a local server to preview the site |
| `test.sh` | Smoke-test the site locally |

## Run locally

```sh
./serve.sh          # serves http://localhost:8001
./serve.sh 3000     # or pick another port
```

Then open <http://localhost:8001>. Edit `index.html` or `quotes.json` and refresh — no build step.

> Note: opening `index.html` directly from the filesystem (`file://`) will not work, because the activity data is fetched from `quotes.json` at runtime. Always go through `serve.sh`.

## Test

```sh
./test.sh
```

Starts a temporary server, checks that `index.html` and `quotes.json` are served, and validates the structure of `quotes.json` (must contain non-empty `soft` and `hard` string lists). Exits non-zero on failure.

## Deployment

Every push to `main` deploys automatically to Azure Static Web Apps via the GitHub Actions workflow in `.github/workflows/`.
