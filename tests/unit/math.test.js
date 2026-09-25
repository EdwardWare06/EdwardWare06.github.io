import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clamp01, smooth, smoothRange, lerp, lerpAngle } from '../../assets/js/lib/math.js';

test('clamp01 keeps values in 0..1', () => {
  assert.equal(clamp01(-2), 0); assert.equal(clamp01(0.4), 0.4); assert.equal(clamp01(7), 1);
});
test('smooth is a smoothstep', () => {
  assert.equal(smooth(0), 0); assert.equal(smooth(1), 1); assert.equal(smooth(0.5), 0.5); assert.equal(smooth(2), 1);
});
test('smoothRange maps a range', () => {
  assert.equal(smoothRange(2, 4, 3), 0.5); assert.equal(smoothRange(2, 4, 1), 0);
});
test('lerp', () => { assert.equal(lerp(10, 20, 0.25), 12.5); });
test('lerpAngle goes the short way round', () => {
  assert.ok(Math.abs(lerpAngle(0, 1, 0.5) - 0.5) < 1e-9);
  assert.ok(Math.abs(lerpAngle(3, -3, 0.5) - (3 + (2 * Math.PI - 6) / 2)) < 1e-9);
});
