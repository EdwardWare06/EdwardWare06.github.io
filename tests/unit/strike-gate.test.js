import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Storm } from '../../work/lightning/demo/sim/storm.js';
import { DEFAULTS, mergeConfig } from '../../work/lightning/demo/config.js';
import { Rng } from '../../work/lightning/demo/core/prng.js';
import { gateStrikes } from '../../assets/js/demos/strike-gate.js';

// 120 simulated seconds of Edward's real storm, with a restless cursor (arcs) and frequent clicks.
function strikeTimes(gated) {
  const times = [];
  const emit = o => times.push(o.time);
  const host = { emitStrike: gated ? gateStrikes(emit) : emit, flash() {}, groundFromScreen(x, y, out) { out[0] = 0; out[1] = 0; } };
  const storm = new Storm(mergeConfig(DEFAULTS, { seed: 1 }), new Rng(1), host);
  for (let i = 0; i < 120 * 60; i++) {
    const t = i / 60;
    if (i % 7 === 0) storm.setCursor(Math.sin(t * 3), Math.cos(t * 2));
    if (i % 23 === 0) storm.forceStrike(t, 0, 0);
    storm.update(t, 1 / 60);
  }
  return times;
}
const maxInOneSecond = ts => Math.max(0, ...ts.map(a => ts.filter(b => b >= a && b <= a + 1).length));

test('ungated, the storm strikes more than twice in some second', () => {
  assert.ok(maxInOneSecond(strikeTimes(false)) > 2);
});
test('the demo gate keeps every kind of strike to two per second', () => {
  const ts = strikeTimes(true);
  assert.ok(ts.length > 50, 'the storm still strikes');
  assert.ok(maxInOneSecond(ts) <= 2, `max ${maxInOneSecond(ts)} in one second`);
});
