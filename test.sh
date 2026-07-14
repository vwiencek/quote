#!/bin/sh
# Smoke-test the site: start a temporary server, check that every
# page/asset is served and that quotes.json is well-formed.
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
check_url quotes.json

if python3 - <<'EOF'
import json, sys
with open("quotes.json") as f:
    data = json.load(f)
assert set(data.keys()) == {"soft", "hard"}, f"unexpected keys: {set(data.keys())}"
for key, items in data.items():
    assert isinstance(items, list) and items, f"'{key}' must be a non-empty list"
    assert all(isinstance(i, str) and i.strip() for i in items), f"'{key}' items must be non-empty strings"
print(f"OK   quotes.json structure (soft: {len(data['soft'])} items, hard: {len(data['hard'])} items)")
EOF
then :; else
  echo "FAIL quotes.json structure"
  FAIL=1
fi

if [ "$FAIL" = "0" ]; then
  echo "All tests passed."
else
  echo "Some tests FAILED."
fi
exit "$FAIL"
