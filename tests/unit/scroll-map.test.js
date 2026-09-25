import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeIndex, splitProgress, stageLayout } from '../../assets/js/scroll-map.js';

test('active section is the last one whose top passed the middle', () => {
  assert.equal(activeIndex([0, 800, 1600], 1000), 0);
  assert.equal(activeIndex([-900, 100, 900], 1000), 1);
  assert.equal(activeIndex([-2000, -1000, -10], 1000), 2);
});
test('split progress', () => {
  assert.equal(splitProgress(1000, 1000), 0);
  assert.equal(splitProgress(0, 1000), 1);
});
test('stage layout eases from hero to split', () => {
  assert.deepEqual(stageLayout(0), { off: 0.3, zoom: 1 });
  const s = stageLayout(1);
  assert.ok(Math.abs(s.off - 0.44) < 1e-9 && Math.abs(s.zoom - 1.28) < 1e-9);
});
