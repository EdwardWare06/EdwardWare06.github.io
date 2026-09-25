#!/bin/sh
# Serve the repo root at http://localhost:8080 (ES modules need http, not file://).
cd "$(dirname "$0")/.." && exec python3 -m http.server 8080 --bind 127.0.0.1
