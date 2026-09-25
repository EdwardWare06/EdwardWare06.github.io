#!/bin/sh
# Print the resume page to PDF with Windows Chrome, driven by the Windows Node binary.
cd "$(dirname "$0")/.." && WSLENV="RESUME_URL${WSLENV:+:$WSLENV}" exec "/mnt/c/Program Files/nodejs/node.exe" tools/print-resume.mjs "$@"
