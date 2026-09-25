import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FORM, FORM_NAMES, CAMERA, TRAIL_FADE, TAIL_RGB, HOME_MAPPING, formFromName } from '../../assets/js/engine/forms.js';

test('seven forms with ids 0..6', () => {
  assert.deepEqual(Object.values(FORM).sort(), [0, 1, 2, 3, 4, 5, 6]);
  for (const arr of [FORM_NAMES, CAMERA, TRAIL_FADE, TAIL_RGB]) assert.equal(arr.length, 7);
});
test('home mapping follows the spec', () => {
  assert.deepEqual(HOME_MAPPING, [FORM.GALAXY, FORM.BLACK_HOLE, FORM.PULSAR, FORM.PLANET, FORM.ATTRACTOR, FORM.NEBULA]);
});
test('formFromName', () => {
  assert.equal(formFromName('pulsar'), FORM.PULSAR);
  assert.equal(formFromName('storm-planet'), FORM.PLANET);
  assert.throws(() => formFromName('comet'));
});
