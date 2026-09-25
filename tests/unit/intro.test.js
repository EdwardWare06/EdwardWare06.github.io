import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldPlayIntro, markIntroSeen, INTRO_KEY } from '../../assets/js/intro.js';

const store = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };

test('a fresh session plays the intro', () => { assert.equal(shouldPlayIntro({ storage: store() }), true); });
test('a session that saw it does not', () => { assert.equal(shouldPlayIntro({ storage: store({ [INTRO_KEY]: '1' }) }), false); });
test('reduce motion never plays, even when forced', () => { assert.equal(shouldPlayIntro({ storage: store(), reduced: true, forced: true }), false); });
test('hash skips intro', () => { assert.equal(shouldPlayIntro({ storage: store(), hash: '#work' }), false); });
test('a bare # still plays', () => { assert.equal(shouldPlayIntro({ storage: store(), hash: '#' }), true); });
test('?nointro disables it', () => { assert.equal(shouldPlayIntro({ storage: store(), disabled: true }), false); });
test('?intro forces it after it was seen', () => { assert.equal(shouldPlayIntro({ storage: store({ [INTRO_KEY]: '1' }), forced: true }), true); });
test('blocked storage still plays', () => { assert.equal(shouldPlayIntro({ storage: { getItem() { throw new Error('blocked'); } } }), true); });
test('markIntroSeen writes the key', () => { const s = store(); markIntroSeen(s); assert.equal(s.getItem(INTRO_KEY), '1'); });
