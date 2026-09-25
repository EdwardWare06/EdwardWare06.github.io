// Lightning channel renderer.
/*
 Every live segment in the scene lives in one interleaved ring buffer and the
 whole scene is drawn with a single instanced call (two when the live range
 wraps). The vertex shader expands each segment into a screen space quad and
 the fragment shader shades it as a glowing capsule, so line width, round caps,
 decay, flicker and restrikes all happen on the GPU with no per-frame CPU work
 beyond appending new segments.
*/

const STRIDE = 11;        // p0(3) p1(3) width birth life tier seed
const BYTES = STRIDE * 4;

const VS = `#version 300 es
layout(location = 0) in vec2 aCorner;   // x: along segment 0..1, y: side -1..1
layout(location = 1) in vec3 aP0;
layout(location = 2) in vec3 aP1;
layout(location = 3) in vec4 aParams;   // width, birth, life, tier
layout(location = 4) in float aSeed;

uniform mat4 uMVP;
uniform vec2 uRes;
uniform float uTime;
uniform float uMirror;
uniform float uIntensity;
uniform float uHaloScale;
uniform float uPxScale;

out vec2 vA;
out vec2 vB;
out float vI;
out float vCore;
out float vHalo;
out float vTier;

float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

void main() {
  float width = aParams.x;
  float birth = aParams.y;
  float life  = max(aParams.z, 1e-3);
  float tier  = aParams.w;

  float t = uTime - birth;
  float n = t / life;

  vTier = tier;
  vA = vec2(0.0);
  vB = vec2(0.0);
  vCore = 1.0;
  vHalo = 1.0;

  if (t < 0.0 || n > 1.0) {
    // Unborn or dead: collapse off screen so it costs no fill.
    vI = 0.0;
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }

  float attack = smoothstep(0.0, 0.014, t);
  float decayRate = tier < 0.5 ? 3.0 : (tier < 1.5 ? 6.5 : 2.2);
  float env = attack * exp(-decayRate * n);

  // Trunk restrikes: a handful of pseudo random re-illuminations per bolt.
  float flick = 1.0;
  if (tier < 0.5) {
    for (int k = 0; k < 3; k++) {
      float pt = hash11(aSeed * 57.13 + float(k) * 13.77) * 0.72 * life;
      flick += 0.85 * exp(-abs(t - pt) * 46.0);
    }
  }
  float shimmer = 0.82 + 0.36 * sin(uTime * 58.0 + aSeed * 91.0 + aP0.y * 2.7);

  // Clamped: unclamped restrikes stack into a blown out white ball once bloom
  // and the flash exposure spike are applied on top.
  vI = min(env * flick * shimmer * uIntensity, 2.2);
  if (vI <= 0.003) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }

  vec3 p0 = vec3(aP0.x, aP0.y * uMirror, aP0.z);
  vec3 p1 = vec3(aP1.x, aP1.y * uMirror, aP1.z);

  vec4 c0 = uMVP * vec4(p0, 1.0);
  vec4 c1 = uMVP * vec4(p1, 1.0);
  vec2 s0 = (c0.xy / c0.w * 0.5 + 0.5) * uRes;
  vec2 s1 = (c1.xy / c1.w * 0.5 + 0.5) * uRes;

  // Channel width is in pixels at a 1080p reference height, not world units:
  // a world-unit width scales with the orthographic zoom and produces a core
  // tens of pixels across.
  vCore = max(0.55, width * uPxScale * (0.8 + 0.3 * min(vI, 1.6)));
  vHalo = vCore * 2.7 * uHaloScale + 1.6;
  float hw = vCore + vHalo * 2.2;

  vec2 d = s1 - s0;
  float len = length(d);
  vec2 dir = len > 1e-4 ? d / len : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);

  vec2 pos = mix(s0, s1, aCorner.x)
           + nrm * aCorner.y * hw
           + dir * (aCorner.x * 2.0 - 1.0) * hw;

  vA = s0;
  vB = s1;
  gl_Position = vec4(pos / uRes * 2.0 - 1.0, 0.0, 1.0);
}`;

const FS = `#version 300 es
precision highp float;

in vec2 vA;
in vec2 vB;
in float vI;
in float vCore;
in float vHalo;
in float vTier;

uniform vec3 uCoreColor;
uniform vec3 uHaloColor;
uniform vec3 uHaloDeep;

out vec4 outColor;

float segDist(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0);
  return length(pa - ba * h);
}

void main() {
  if (vI <= 0.003) discard;

  float d = segDist(gl_FragCoord.xy, vA, vB);
  float core = exp(-pow(d / vCore, 2.0));
  float halo = exp(-d / vHalo);
  if (core + halo < 0.002) discard;

  // Crawling ground channels read cooler and wider than the airborne trunk.
  float coolness = vTier > 1.5 ? 0.55 : 1.0;
  vec3 col = uCoreColor * core * 1.45 * coolness
           + mix(uHaloDeep, uHaloColor, core) * halo * 0.9;

  outColor = vec4(col * vI, 1.0);
}`;

export class SegmentRenderer {
  constructor(gl, ctxHelpers, capacity) {
    const { createProgram, getUniforms } = ctxHelpers;
    this.gl = gl;
    this.capacity = capacity;
    this.prog = createProgram(gl, VS, FS, 'segments');
    this.u = getUniforms(gl, this.prog);

    this.cpu = new Float32Array(capacity * STRIDE);
    this.death = new Float32Array(capacity);
    this.head = 0;
    this.tail = 0;
    this.live = 0;

    this.pendingStart = 0;
    this.pendingCount = 0;

    this.cornerBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cornerBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      0, -1, 0, 1, 1, -1, 1, 1,
    ]), gl.STATIC_DRAW);

    this.instBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.cpu.byteLength, gl.DYNAMIC_DRAW);

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cornerBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
    for (let loc = 1; loc <= 4; loc++) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribDivisor(loc, 1);
    }
    gl.bindVertexArray(null);
  }

  reset() {
    this.head = 0;
    this.tail = 0;
    this.live = 0;
    this.pendingCount = 0;
  }

  // Appends one segment. Called from the generator; writes straight into the
  // staging array with no allocation.
  add(x0, y0, z0, x1, y1, z1, width, birth, life, tier, seed) {
    if (this.pendingCount >= this.capacity) return false;

    const i = this.head * STRIDE;
    const c = this.cpu;
    c[i] = x0; c[i + 1] = y0; c[i + 2] = z0;
    c[i + 3] = x1; c[i + 4] = y1; c[i + 5] = z1;
    c[i + 6] = width;
    c[i + 7] = birth;
    c[i + 8] = life;
    c[i + 9] = tier;
    c[i + 10] = seed;
    this.death[this.head] = birth + life;

    if (this.pendingCount === 0) this.pendingStart = this.head;
    this.pendingCount++;

    this.head = (this.head + 1) % this.capacity;
    if (this.live < this.capacity) {
      this.live++;
    } else {
      // Buffer full: the oldest segment is overwritten.
      this.tail = this.head;
    }
    return true;
  }

  // Retires expired segments from the tail and uploads whatever was appended
  // this frame, splitting the upload if the write wrapped.
  flush(time) {
    const gl = this.gl;

    while (this.live > 0 && this.death[this.tail] < time) {
      this.tail = (this.tail + 1) % this.capacity;
      this.live--;
    }

    if (this.pendingCount > 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
      const first = Math.min(this.pendingCount, this.capacity - this.pendingStart);
      gl.bufferSubData(
        gl.ARRAY_BUFFER,
        this.pendingStart * BYTES,
        this.cpu,
        this.pendingStart * STRIDE,
        first * STRIDE,
      );
      const rest = this.pendingCount - first;
      if (rest > 0) {
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.cpu, 0, rest * STRIDE);
      }
      this.pendingCount = 0;
    }
  }

  bindRange(offsetSegments) {
    const gl = this.gl;
    const base = offsetSegments * BYTES;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, BYTES, base);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, BYTES, base + 12);
    gl.vertexAttribPointer(3, 4, gl.FLOAT, false, BYTES, base + 24);
    gl.vertexAttribPointer(4, 1, gl.FLOAT, false, BYTES, base + 40);
  }

  draw(camera, time, res, palette, opts) {
    if (this.live === 0) return 0;

    const gl = this.gl;
    const u = this.u;
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);

    gl.uniformMatrix4fv(u.uMVP, false, camera.mvp);
    gl.uniform2f(u.uRes, res[0], res[1]);
    gl.uniform1f(u.uTime, time);
    gl.uniform1f(u.uMirror, opts.mirror ? -1 : 1);
    gl.uniform1f(u.uIntensity, opts.intensity);
    gl.uniform1f(u.uHaloScale, opts.haloScale);
    // Widths are authored against a 1080p tall frame.
    gl.uniform1f(u.uPxScale, res[1] / 1080);
    gl.uniform3fv(u.uCoreColor, palette.core);
    gl.uniform3fv(u.uHaloColor, palette.halo);
    gl.uniform3fv(u.uHaloDeep, palette.haloDeep);

    let calls = 0;
    const contiguous = Math.min(this.live, this.capacity - this.tail);
    this.bindRange(this.tail);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, contiguous);
    calls++;

    const wrapped = this.live - contiguous;
    if (wrapped > 0) {
      this.bindRange(0);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, wrapped);
      calls++;
    }
    return calls;
  }
}

export const SEGMENT_STRIDE = STRIDE;
