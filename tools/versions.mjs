// Content-hash versions for the site's scripts and stylesheets. GitHub Pages lets browsers keep files for
// 10 minutes, so after an update a browser could run a new module against a stale cached import, and then
// no script on the page runs. Each page gets an import map that gives every module it can load a
// ?v=<hash> URL; a file that did not change keeps its URL and stays cached.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SKIP_DIRS = new Set(['.git', '.superpowers', 'node_modules', 'docs', 'tests', 'tools']);
const IMPORT = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s*['"]([^'"]+)['"]/g;
const MODULE_TAG = /<script type="module" src="([^"?]+)(?:\?v=[^"]*)?"><\/script>/g;
const STYLE_TAG = /<link rel="stylesheet" href="([^"?:]+)(?:\?v=[^"]*)?">/g;
const IMPORT_MAP = /[ \t]*<script type="importmap">[\s\S]*?<\/script>\n/;

const src = file => readFileSync(join(ROOT, file));
export const hashOf = file => createHash('sha256').update(src(file)).digest('hex').slice(0, 10);
const urlFrom = (page, ref) => (ref.startsWith('/') ? posix.normalize(ref) : posix.join('/', posix.dirname(page), ref));

// Every public HTML file, relative to the repo root.
export function sitePages(dir = '') {
  const out = [];
  for (const name of readdirSync(join(ROOT, dir))) {
    const p = dir ? `${dir}/${name}` : name;
    if (statSync(join(ROOT, p)).isDirectory()) { if (!SKIP_DIRS.has(name)) out.push(...sitePages(p)); }
    else if (name.endsWith('.html')) out.push(p);
  }
  return out.sort();
}

// Every module reachable from the entry URLs (root-absolute), through static and dynamic imports.
export function moduleGraph(entries) {
  const seen = new Set(), todo = [...entries];
  while (todo.length) {
    const url = todo.pop();
    if (seen.has(url)) continue;
    seen.add(url);
    for (const m of src(url.slice(1)).toString('utf8').matchAll(IMPORT)) {
      const spec = m[1] || m[2] || m[3];
      if (/^(\.{1,2})?\//.test(spec)) todo.push(urlFrom(url.slice(1), spec));
    }
  }
  return [...seen].sort();
}

// The page with versioned module scripts and stylesheets, and an import map before its first module script.
export function stampHtml(html, page) {
  html = html.replace(IMPORT_MAP, '');
  const entries = [...html.matchAll(MODULE_TAG)].map(m => urlFrom(page, m[1]));
  html = html.replace(MODULE_TAG, (_, ref) => `<script type="module" src="${ref}?v=${hashOf(urlFrom(page, ref).slice(1))}"></script>`);
  html = html.replace(STYLE_TAG, (_, ref) => `<link rel="stylesheet" href="${ref}?v=${hashOf(urlFrom(page, ref).slice(1))}">`);
  if (!entries.length) return html;
  const at = html.indexOf('<script type="module"'), line = html.lastIndexOf('\n', at) + 1, indent = html.slice(line, at);
  const rows = moduleGraph(entries).map(u => `${indent}  ${JSON.stringify(u)}: ${JSON.stringify(`${u}?v=${hashOf(u.slice(1))}`)}`);
  const map = `${indent}<script type="importmap">\n${indent}{ "imports": {\n${rows.join(',\n')}\n${indent}} }\n${indent}</script>\n`;
  return html.slice(0, line) + map + html.slice(line);
}
