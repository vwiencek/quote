#!/bin/sh
# Smoke-test the site: start a temporary server, check that the page is
# served, and validate that the Google Sheet data source is reachable
# and well-formed (needs network access).
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

SHEET_ID=$(sed -n 's/.*const SHEET_ID = "\([^"]*\)".*/\1/p' index.html)
if [ -z "$SHEET_ID" ]; then
  echo "FAIL could not extract SHEET_ID from index.html"
  FAIL=1
elif curl -s -L -m 20 "https://docs.google.com/spreadsheets/d/$SHEET_ID/gviz/tq?tqx=out:csv" | python3 -c "
import csv, sys, collections
rows = list(csv.reader(sys.stdin))
assert rows, 'empty sheet'
headers = [h.strip().lower() for h in rows[0]]
counts = collections.Counter()
level_col = 'level' if 'level' in headers else ('type' if 'type' in headers else None)
if level_col:
    type_idx = headers.index(level_col)
    text_idx = headers.index('gage') if 'gage' in headers else next(i for i, h in enumerate(headers) if h and i != type_idx)
    for r in rows[1:]:
        if len(r) > max(type_idx, text_idx) and r[text_idx].strip() and r[type_idx].strip():
            counts[r[type_idx].strip().lower()] += 1
else:
    for i, h in enumerate(headers):
        if h:
            counts[h] = sum(1 for r in rows[1:] if len(r) > i and r[i].strip())
assert counts.get('soft', 0) > 0 and counts.get('hard', 0) > 0, f'missing soft/hard entries: {dict(counts)}'
print(f\"OK   Google Sheet data (soft: {counts['soft']}, hard: {counts['hard']})\")
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
