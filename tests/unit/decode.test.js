import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scramble, GLYPHS } from '../../assets/js/lib/decode.js';

test('full progress returns the text', () => { assert.equal(scramble('EDWARD WARE', 1), 'EDWARD WARE'); });
test('progress is clamped', () => { assert.equal(scramble('WORK', 3), 'WORK'); });
test('zero progress keeps length and spaces, shows only glyphs', () => {
  const s = scramble('EDWARD WARE', 0);
  assert.equal(s.length, 11);
  assert.equal(s[6], ' ');
  for (const ch of s.replace(' ', '')) assert.ok(GLYPHS.includes(ch), `unexpected ${ch}`);
});
test('half progress reveals the left half', () => { assert.ok(scramble('ABCDEF', 0.5).startsWith('ABC')); });
test('rand picks the glyph', () => { assert.equal(scramble('AB', 0, () => 0), GLYPHS[0] + GLYPHS[0]); });
