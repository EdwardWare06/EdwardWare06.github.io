#!/bin/sh
# Download the latin woff2 files the site uses (SIL Open Font License) into assets/fonts/.
set -e
cd "$(dirname "$0")/.."
mkdir -p assets/fonts
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
CSS=$(curl -fsS -A "$UA" "https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&family=IBM+Plex+Mono:wght@400;500&display=swap")
# print the woff2 URL of the latin block for a family and weight
pick() {
  printf '%s\n' "$CSS" | awk -v fam="$1" -v w="$2" '
    /\/\* latin \*\//   { b = 1; f = 0; ww = 0; next }
    b && /font-family/  { f = index($0, fam) > 0 }
    b && /font-weight/  { ww = index($0, w) > 0 }
    b && /src:/         { if (f && ww) { match($0, /https:[^)]+/); print substr($0, RSTART, RLENGTH); exit } }
    /}/                 { b = 0 }'
}
curl -fsS -o assets/fonts/archivo-var-latin.woff2   "$(pick 'Archivo' '100 900')"
curl -fsS -o assets/fonts/plex-mono-400-latin.woff2 "$(pick 'IBM Plex Mono' ': 400')"
curl -fsS -o assets/fonts/plex-mono-500-latin.woff2 "$(pick 'IBM Plex Mono' ': 500')"
curl -fsS -o assets/fonts/OFL-Archivo.txt       https://raw.githubusercontent.com/google/fonts/main/ofl/archivo/OFL.txt
curl -fsS -o assets/fonts/OFL-IBM-Plex-Mono.txt https://raw.githubusercontent.com/google/fonts/main/ofl/ibmplexmono/OFL.txt
ls -l assets/fonts
