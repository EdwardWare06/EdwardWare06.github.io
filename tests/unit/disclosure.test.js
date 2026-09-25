import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

// Terms that must never be published live in a local, git-ignored file: GitHub Pages serves every tracked file,
// and hashes of short values can be reversed, so neither the terms nor hashes of them belong in the repo.
const TERMS_FILE = '.superpowers/private-terms.txt';

test('no tracked file contains a private term', () => {
  assert.ok(existsSync(TERMS_FILE), `${TERMS_FILE} is missing: create it (one lowercase word or word pair per line) before publishing`);
  const terms = new Set(readFileSync(TERMS_FILE, 'utf8').split('\n').map(l => l.trim().toLowerCase()).filter(l => l && !l.startsWith('#')));
  assert.ok(terms.size > 0, `${TERMS_FILE} lists no terms`);
  const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0')
    .filter(f => f && !/\.(woff2|webp|png|jpe?g|pdf)$/i.test(f));
  const hits = [];
  for (const f of files) {
    const words = readFileSync(f, 'utf8').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    words.forEach((w, i) => {
      if (terms.has(w) || (i + 1 < words.length && terms.has(`${w} ${words[i + 1]}`))) hits.push(`${f} (word ${i})`);
    });
  }
  assert.deepEqual(hits, []);
});
