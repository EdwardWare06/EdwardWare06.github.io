import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCRIPT, DURATION, speakerAt } from '../../assets/js/demos/speaker-split.js';

test('speaker at a moment in the recording', () => {
  assert.equal(speakerAt(1), 'A');
  assert.equal(speakerAt(3), 'B');
  assert.equal(speakerAt(6), 'C');
  assert.equal(speakerAt(9.9), 'A');
  assert.equal(speakerAt(DURATION), null);
});
test('segments cover the recording with no gaps', () => {
  assert.equal(SCRIPT[0].t0, 0);
  for (let i = 1; i < SCRIPT.length; i++) assert.equal(SCRIPT[i].t0, SCRIPT[i - 1].t1);
  assert.equal(SCRIPT.at(-1).t1, DURATION);
});
test('the first line is a self-introduction that links the name', () => {
  assert.ok(SCRIPT[0].text.includes('My name is'));
  assert.ok(SCRIPT[0].how.startsWith('NAME LINK'));
});
test('the other lines are voiceprint matches', () => {
  for (const s of SCRIPT.slice(1)) assert.match(s.how, /^MATCH 0\.\d\d$/);
});
