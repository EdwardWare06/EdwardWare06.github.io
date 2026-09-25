import { test } from 'node:test';
import assert from 'node:assert/strict';
import { particleCount, initialTier, nextTier, FrameMeter } from '../../assets/js/engine/quality.js';

test('particle counts', () => {
  assert.equal(particleCount('high'), 262144);
  assert.equal(particleCount('mid'), 262144);
  assert.equal(particleCount('low'), 131072);
  assert.equal(particleCount('mobile'), 65536);
});
test('initial tier', () => {
  assert.equal(initialTier({ coarse: true, width: 1400 }), 'mobile');
  assert.equal(initialTier({ coarse: false, width: 800 }), 'mobile');
  assert.equal(initialTier({ coarse: false, width: 1440 }), 'high');
});
test('slow frames step down: resolution first, then particles', () => {
  assert.equal(nextTier('high', 25), 'mid');
  assert.equal(nextTier('mid', 25), 'low');
  assert.equal(nextTier('low', 40), 'low');
  assert.equal(nextTier('high', 12), 'high');
  assert.equal(nextTier('mobile', 40), 'mobile');
});
test('FrameMeter keeps a rolling average', () => {
  const m = new FrameMeter(3);
  [10, 20, 30, 40].forEach(v => m.add(v));
  assert.equal(m.avg, 30);
  m.reset(); assert.equal(m.avg, 0);
});
