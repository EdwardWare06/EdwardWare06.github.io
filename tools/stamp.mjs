// Writes the current file versions into every page (see versions.mjs). Run after changing a script or a stylesheet.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { sitePages, stampHtml } from './versions.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
for (const page of sitePages()) {
  const file = join(ROOT, page), html = readFileSync(file, 'utf8'), out = stampHtml(html, page);
  if (out !== html) { writeFileSync(file, out); console.log(`stamped ${page}`); }
}
