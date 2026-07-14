# quote

**Soft or Hard Picker** — a small static web app that helps you pick a random activity and time-box it.

## What the site does

1. You pick a mode: **Soft** or **Hard**.
2. The page answers with:
   - a random activity from the list matching your mode (loaded from [`quotes.json`](quotes.json))
   - a random duration between **2 and 10 minutes**
3. A **countdown timer** starts from that duration down to `0:00`, so you can actually measure the time spent on the task. When it reaches zero the timer turns green and shows "Time's up!".

Clicking a button again re-rolls the activity and restarts the timer.

## Files

| File | Purpose |
|------|---------|
| `index.html` | The whole app (markup, styles, logic) |
| `quotes.json` | The activity lists — edit this file to change the `soft` / `hard` items |
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
