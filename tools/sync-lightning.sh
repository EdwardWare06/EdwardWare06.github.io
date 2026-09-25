#!/bin/sh
# Copy Edward's Lightning Background scene into the site and hook the adapter in.
# usage: sh tools/sync-lightning.sh ["path/to/Lightning Background/web"]
set -e
cd "$(dirname "$0")/.."
SRC="${1:-../Lightning Background/web}"
DEST=work/lightning/demo
[ -f "$SRC/main.js" ] || { echo "no scene at $SRC" >&2; exit 1; }
rm -rf "$DEST.tmp" && mkdir -p "$DEST.tmp"
cp -r "$SRC"/. "$DEST.tmp"/
# load the adapter after the scene, and keep the frame out of search results
sed -i 's#<script type="module" src="./main.js"></script>#<script type="module" src="./main.js"></script>\n  <script type="module" src="/assets/js/demos/lightning-adapter.js"></script>#' "$DEST.tmp/index.html"
sed -i 's#<title>Lightning Background</title>#<title>Lightning Background</title>\n<meta name="robots" content="noindex">#' "$DEST.tmp/index.html"
grep -q 'lightning-adapter.js' "$DEST.tmp/index.html" || { echo "adapter hook failed" >&2; exit 1; }
rm -rf "$DEST" && mv "$DEST.tmp" "$DEST"
echo "synced $(find "$DEST" -name '*.js' | wc -l) modules into $DEST"
# new scene files change the versions in the pages
node tools/stamp.mjs
