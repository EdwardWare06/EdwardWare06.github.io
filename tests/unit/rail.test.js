import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tickFractions } from '../../assets/js/rail.js';

test('ticks sit where each section starts on the scroll track', () => {
  assert.deepEqual(tickFractions([0, 1000, 2000], 3000, 1000), [0, 0.5, 1]);
});
test('ticks are clamped to the track', () => {
  assert.deepEqual(tickFractions([-50, 5000], 3000, 1000), [0, 1]);
});
test('a page shorter than the window does not divide by zero', () => {
  assert.deepEqual(tickFractions([0, 400], 800, 1000), [0, 1]);
});
