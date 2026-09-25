import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UPDATE_FS, BRAIN_FS } from '../../assets/js/engine/shaders.js';

// The update shader runs every frame and its first draw freezes the page while the driver compiles it,
// so geometry that never changes (the brain) is built once by its own small shader and only read here.
test('the brain geometry is built once, outside the per-frame update shader', () => {
  assert.equal(typeof BRAIN_FS, 'string');
  assert.match(BRAIN_FS, /fibre\(/);
  assert.doesNotMatch(UPDATE_FS, /fibre\(|bdir\(|floor\(h\.y\*26\.\)/);
  assert.match(UPDATE_FS, /uniform sampler2D[^;]*\buBrain\b/);
});
