import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONSTELLATIONS } from '../../assets/js/constellations.js';

test('the four spec constellations', () => {
  assert.deepEqual(Object.keys(CONSTELLATIONS).sort(), ['aquila', 'dipper', 'hercules', 'lyra']);
  assert.equal(CONSTELLATIONS.dipper.name, 'URSA MAJOR · THE PLOUGH');
  assert.equal(CONSTELLATIONS.lyra.name, 'LYRA · THE LYRE');
  assert.equal(CONSTELLATIONS.aquila.name, 'AQUILA · BEARER OF THUNDERBOLTS');
  assert.equal(CONSTELLATIONS.hercules.name, 'HERCULES · THE STRONGMAN');
});
test('edges point at real stars and coordinates are normalized', () => {
  for (const c of Object.values(CONSTELLATIONS)) {
    for (const [i, j] of c.edges) assert.ok(c.stars[i] && c.stars[j]);
    for (const [x, y] of c.stars) assert.ok(x >= 0 && x <= 1 && y >= 0 && y <= 1);
  }
});
