#!/bin/sh
# Serve the site locally to preview modifications.
# Usage: ./serve.sh [port]   (default port: 8001)
cd "$(dirname "$0")"
PORT="${1:-8001}"
echo "Serving http://localhost:$PORT"
exec python3 -m http.server "$PORT" --bind 127.0.0.1
