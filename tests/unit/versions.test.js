import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hashOf, moduleGraph, stampHtml, sitePages } from '../../tools/versions.mjs';

// GitHub Pages lets browsers keep files for 10 minutes. Without versions, a visitor who comes back
// just after an update can run a new module against a stale cached import, and then no script runs.
const read = f => readFileSync(f, 'utf8');
const importMap = html => JSON.parse((html.match(/<script type="importmap">([\s\S]*?)<\/script>/) || [])[1] || 'null');

test('the module graph follows static and dynamic imports from the entry', () => {
  const g = moduleGraph(['/assets/js/page.js']);
  for (const m of ['/assets/js/page.js', '/assets/js/engine/stage.js', '/assets/js/engine/shaders.js', '/assets/js/lib/decode.js', '/assets/js/timeline.js', '/assets/js/lost.js']) {
    assert.ok(g.includes(m), `graph misses ${m}`);
  }
});

test('stamping adds an import map before the first module script and versions the entry and the stylesheet', () => {
  const html = '<head>\n<link rel="stylesheet" href="/assets/css/site.css">\n<script type="module" src="/assets/js/page.js"></script>\n</head>';
  const out = stampHtml(html, 'index.html');
  const map = importMap(out);
  assert.ok(map, 'no import map');
  assert.ok(out.indexOf('type="importmap"') < out.indexOf('type="module"'), 'the import map must come before the module script');
  assert.equal(map.imports['/assets/js/engine/shaders.js'], `/assets/js/engine/shaders.js?v=${hashOf('assets/js/engine/shaders.js')}`);
  assert.ok(out.includes(`src="/assets/js/page.js?v=${hashOf('assets/js/page.js')}"`), 'entry script not versioned');
  assert.ok(out.includes(`href="/assets/css/site.css?v=${hashOf('assets/css/site.css')}"`), 'stylesheet not versioned');
  assert.equal(stampHtml(out, 'index.html'), out, 'stamping twice changes nothing');
});

test('every page is stamped with the current file versions (run `npm run stamp` after changing a script or the stylesheet)', () => {
  const pages = sitePages();
  assert.ok(pages.includes('index.html') && pages.includes('work/lightning/demo/index.html'), 'page list');
  for (const f of pages) {
    const h = read(f);
    assert.ok(importMap(h), `${f}: no import map`);
    assert.equal(stampHtml(h, f), h, `${f}: out of date, run npm run stamp`);
  }
});
