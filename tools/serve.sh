#!/bin/sh
# Serve the repo root at http://localhost:8080 (ES modules need http, not file://), with no-cache headers.
cd "$(dirname "$0")/.." && exec python3 tools/serve.py
