import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { posix } from 'node:path';

const SITE = 'https://edwardware06.github.io';
// Paths plan 2 has not built yet. Each page task deletes its entries; Task 9 checks the set is empty.
const PLANNED = new Set(['/work/lightning/', '/about/', '/timeline/', '/resume/', '/resume/Edward-Ware-Resume.pdf']);
const SKIP_DIRS = new Set(['.git', '.superpowers', 'node_modules', 'docs', 'tests', 'tools']);

function htmlFiles(dir = '.') {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = dir === '.' ? name : `${dir}/${name}`;
    if (statSync(p).isDirectory()) { if (!SKIP_DIRS.has(name)) out.push(...htmlFiles(p)); }
    else if (name.endsWith('.html')) out.push(p);
  }
  return out;
}
const ALL = htmlFiles();
const PAGES = ALL.filter(f => !f.startsWith('work/lightning/demo/')); // the demo frame is not a page
const urlOf = f => '/' + f.replace(/(^|\/)index\.html$/, '$1');
const read = f => readFileSync(f, 'utf8');
const pick = (html, re) => (html.match(re) || [])[1];
const meta = (html, key) => pick(html, new RegExp(`<meta (?:name|property)="${key}" content="([^"]*)"`));

test('share image, icons, robots, sitemap and .nojekyll exist', () => {
  for (const f of ['assets/img/og-galaxy.jpg', 'assets/img/favicon.svg', 'assets/img/apple-touch-icon.png', 'robots.txt', 'sitemap.xml', '.nojekyll']) assert.ok(existsSync(f), f);
  const robots = read('robots.txt');
  assert.match(robots, /^User-agent: \*$/m);
  assert.match(robots, new RegExp(`^Sitemap: ${SITE}/sitemap.xml$`, 'm'));
  for (const d of ['/tests/', '/tools/', '/work/lightning/demo/']) assert.match(robots, new RegExp(`^Disallow: ${d}$`, 'm'));
});

test('every page has a title, a description, a canonical URL and share tags', () => {
  for (const f of PAGES) {
    const h = read(f), url = urlOf(f);
    assert.match(h, /<html lang="en">/, `${f}: lang`);
    const title = pick(h, /<title>([^<]+)<\/title>/);
    assert.ok(title && title.includes('Edward Ware'), `${f}: title`);
    const desc = meta(h, 'description');
    assert.ok(desc && desc.length >= 50 && desc.length <= 170, `${f}: description is 50-170 characters`);
    assert.equal(meta(h, 'og:title'), title, `${f}: og:title`);
    assert.equal(meta(h, 'og:description'), desc, `${f}: og:description`);
    assert.equal(meta(h, 'og:type'), 'website', `${f}: og:type`);
    assert.equal(meta(h, 'og:image'), `${SITE}/assets/img/og-galaxy.jpg`, `${f}: og:image`);
    assert.equal(meta(h, 'twitter:card'), 'summary_large_image', `${f}: twitter:card`);
    assert.ok(h.includes('<link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">'), `${f}: favicon`);
    if (f === '404.html') { assert.equal(meta(h, 'robots'), 'noindex', '404: noindex'); continue; }
    assert.equal(pick(h, /<link rel="canonical" href="([^"]+)">/), SITE + url, `${f}: canonical`);
    assert.equal(meta(h, 'og:url'), SITE + url, `${f}: og:url`);
  }
});

test('every page has one h1 and the main nav', () => {
  for (const f of PAGES) {
    const h = read(f);
    assert.equal((h.match(/<h1[\s>]/g) || []).length, 1, `${f}: one h1`);
    const nav = pick(h, /<nav class="nav label" aria-label="Main">([\s\S]*?)<\/nav>/);
    assert.ok(nav, `${f}: nav`);
    assert.deepEqual([...nav.matchAll(/href="([^"]+)"/g)].map(m => m[1]), ['/', '/#work', '/about/', '/timeline/', '/resume/'], `${f}: nav links`);
  }
});

test('internal links and assets resolve, anchors included', () => {
  for (const f of ALL) {
    const h = read(f);
    for (const [, ref] of h.matchAll(/(?:href|src)="([^"]+)"/g)) {
      if (/^(https?:|mailto:|data:|#)/.test(ref)) continue;
      // GitHub Pages serves 404.html at any missing path, so its URLs must not depend on where it is
      if (f === '404.html') assert.ok(ref.startsWith('/'), `404.html must use root-absolute URLs: ${ref}`);
      const [pathPart, hash] = ref.split('?')[0].split('#');
      const abs = pathPart.startsWith('/') ? pathPart : '/' + posix.join(posix.dirname(f), pathPart);
      if (PLANNED.has(abs)) continue;
      const file = (abs.endsWith('/') ? abs + 'index.html' : abs).slice(1);
      assert.ok(existsSync(file), `${f}: ${ref} → ${file} is missing`);
      if (hash && file.endsWith('.html')) assert.ok(read(file).includes(`id="${hash}"`), `${f}: ${ref} → no id="${hash}"`);
    }
  }
});

test('the sitemap lists every page except the 404', () => {
  const locs = [...read('sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]).sort();
  const urls = new Set([...PAGES.filter(f => f !== '404.html').map(urlOf), ...[...PLANNED].filter(p => p.endsWith('/'))]);
  assert.deepEqual(locs, [...urls].map(u => SITE + u).sort());
});
