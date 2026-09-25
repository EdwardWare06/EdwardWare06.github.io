#!/bin/sh
# Browser checks run in Windows Chrome on the real GPU, driven by the Windows Node binary.
cd "$(dirname "$0")/.." && WSLENV="BASE${WSLENV:+:$WSLENV}" exec "/mnt/c/Program Files/nodejs/node.exe" tools/check.mjs "$@"
