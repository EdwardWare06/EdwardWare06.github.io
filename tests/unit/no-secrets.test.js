import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Hashes of short values can be reversed by brute force, so no tracked file may carry a SHA-256-sized hex literal.
test('no tracked file holds a 64-character hex literal', () => {
  const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0')
    .filter(f => f && !/\.(woff2|webp|png|jpe?g|pdf)$/i.test(f));
  const hits = files.filter(f => /\b[0-9a-f]{64}\b/i.test(readFileSync(f, 'utf8')));
  assert.deepEqual(hits, []);
});
