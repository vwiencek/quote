#!/bin/sh
# Smoke-test the site: start a temporary server, check that the page and
# PWA assets are served, and validate that the Google Sheet data source
# is reachable and well-formed (needs network access).
# Usage: ./test.sh
cd "$(dirname "$0")"
PORT=8765
FAIL=0

python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null' EXIT
sleep 1

check_url() {
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT/$1")
  if [ "$CODE" = "200" ]; then
    echo "OK   /$1"
  else
    echo "FAIL /$1 (HTTP $CODE)"
    FAIL=1
  fi
}

check_url index.html
check_url styles.css
check_url manifest.json
check_url sw.js
check_url icon-192.png
check_url icon-512.png
check_url icon-180.png

SOUND=$(sed -n 's/.*const END_SOUND_URL = "\([^"]*\)".*/\1/p' index.html)
[ -n "$SOUND" ] && check_url "$SOUND"

SHEET_ID=$(sed -n 's/.*const SHEET_ID = "\([^"]*\)".*/\1/p' index.html)
if [ -z "$SHEET_ID" ]; then
  echo "FAIL could not extract SHEET_ID from index.html"
  FAIL=1
elif curl -s -L -m 20 "https://docs.google.com/spreadsheets/d/$SHEET_ID/gviz/tq?tqx=out:csv" | python3 -c "
import csv, sys, collections
rows = list(csv.reader(sys.stdin))
assert rows, 'empty sheet'
headers = [h.strip().lower() for h in rows[0]]
idx = {h: i for i, h in enumerate(headers) if h}
level_col = 'level' if 'level' in idx else ('type' if 'type' in idx else None)
assert level_col, f'no level/type column in {headers}'
text_idx = idx.get('gage', next(i for i, h in enumerate(headers) if h and i != idx[level_col]))

def cell(r, i):
    return r[i].strip() if i is not None and i < len(r) else ''

# The app tolerates missing player/min/max/keyword (defaults apply) and
# skips rows without a level; those are reported as warnings, not failures.
counts = collections.Counter()
warnings = []
for n, r in enumerate(rows[1:], 2):
    text = cell(r, text_idx)
    level = cell(r, idx[level_col]).lower()
    if not text and not level:
        continue  # blank row
    if not level:
        warnings.append(f'row {n}: no level -> gage is ignored by the app')
        continue
    if not text:
        warnings.append(f'row {n}: level without gage text')
        continue
    if level not in ('soft', 'hard'):
        warnings.append(f'row {n}: unknown level {level!r} -> unreachable from the UI')
    counts[level] += 1
    if 'player' in idx:
        p = cell(r, idx['player']).lower()
        if p and p not in ('homme', 'femme', 'both'):
            warnings.append(f'row {n}: unknown player {p!r} -> gage never drawn')
    if 'min' in idx and 'max' in idx:
        mn, mx = cell(r, idx['min']), cell(r, idx['max'])
        if mn.isdigit() and mx.isdigit() and int(mn) > int(mx):
            warnings.append(f'row {n}: min {mn} > max {mx} (app swaps them)')

assert counts.get('soft', 0) > 0 and counts.get('hard', 0) > 0, f'missing soft/hard entries: {dict(counts)}'
for w in warnings[:5]:
    print(f'WARN sheet {w}')
if len(warnings) > 5:
    print(f'WARN sheet ... and {len(warnings) - 5} more (incomplete rows are fine while editing)')
print(f\"OK   Google Sheet data (soft: {counts['soft']}, hard: {counts['hard']}, warnings: {len(warnings)})\")
"; then :; else
  echo "FAIL Google Sheet data (unreachable, not shared, or malformed)"
  FAIL=1
fi

if [ "$FAIL" = "0" ]; then
  echo "All tests passed."
else
  echo "Some tests FAILED."
fi
exit "$FAIL"
