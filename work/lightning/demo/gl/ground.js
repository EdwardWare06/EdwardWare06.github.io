/*
 Isometric ground plane: procedural grid with derivative based antialiasing,
 distance fog into the void, up to eight live impact lights, and a persistent
 scorch texture that impacts splat into and that decays on the GPU.
*/
const MAX_LIGHTS = 8;

const GROUND_VS = `#version 300 es
layout(location = 0) in vec2 aCorner;   // -1..1 quad
uniform mat4 uMVP;
uniform float uExtent;
out vec3 vWorld;
void main() {
  vWorld = vec3(aCorner.x * uExtent, 0.0, aCorner.y * uExtent);
  gl_Position = uMVP * vec4(vWorld, 1.0);
}`;

const GROUND_FS = `#version 300 es
precision highp float;

in vec3 vWorld;

uniform vec3 uVoid;
uniform vec3 uGrid;
uniform vec3 uHalo;
uniform vec3 uCore;
uniform float uCell;
uniform float uExtent;
uniform float uFogDensity;
uniform float uGridBrightness;
uniform float uTime;
uniform float uFlash;
uniform vec4 uLights[${MAX_LIGHTS}];   // x, z, intensity, radius
uniform sampler2D uScorch;
uniform float uScorchAmount;

out vec4 outColor;

// Antialiased line at every multiple of the cell size, width independent of zoom.
float gridLine(vec2 p, float cell, float thickness) {
  vec2 g = abs(fract(p / cell - 0.5) - 0.5) * cell;
  vec2 w = fwidth(p) * 1.1 + 1e-4;
  vec2 line = smoothstep(thickness + w, w * 0.5, g);
  return max(line.x, line.y);
}

void main() {
  vec2 p = vWorld.xz;
  float dist = length(p);

  // Fog: the plane dissolves into the void instead of ending on a hard edge.
  float fog = exp(-dist * uFogDensity);
  float edge = 1.0 - smoothstep(uExtent * 0.55, uExtent * 0.98, dist);
  float vis = fog * edge;

  float fine = gridLine(p, uCell, 0.035 * uCell);
  float coarse = gridLine(p, uCell * 5.0, 0.05 * uCell);
  float grid = fine * 0.55 + coarse * 0.9;

  vec3 col = uVoid * 0.7;
  col += uGrid * grid * uGridBrightness * vis * (0.55 + 0.45 * uFlash);

  // Impact lights: bright pool at the strike point, and they pick out the grid
  // so the plane reads as wet and reflective.
  vec3 lit = vec3(0.0);
  for (int i = 0; i < ${MAX_LIGHTS}; i++) {
    vec4 L = uLights[i];
    if (L.z <= 0.001) continue;
    float d = length(p - L.xy);
    float r = max(L.w, 0.5);
    float atten = 1.0 / (1.0 + pow(d / r, 2.4));
    lit += mix(uHalo, uCore, clamp(atten * 1.6, 0.0, 1.0)) * atten * L.z;
  }
  col += lit * (0.5 + grid * 1.5) * vis;

  // Scorch marks accumulated from previous impacts.
  if (uScorchAmount > 0.0) {
    vec2 uv = p / uExtent * 0.5 + 0.5;
    float s = texture(uScorch, uv).r;
    col += mix(uHalo, uCore, 0.35) * s * uScorchAmount * vis * (0.8 + 0.6 * grid);
  }

  // Faint moving haze so the empty plane is never dead flat.
  float haze = 0.5 + 0.5 * sin(p.x * 0.03 + uTime * 0.15) * sin(p.y * 0.027 - uTime * 0.11);
  col += uVoid * haze * 0.9 * vis;

  outColor = vec4(col, 1.0);
}`;

const SPLAT_VS = `#version 300 es
layout(location = 0) in vec2 aCorner;
uniform vec2 uCenter;   // uv space
uniform float uRadius;  // uv space
out vec2 vLocal;
void main() {
  vLocal = aCorner;
  vec2 uv = uCenter + aCorner * uRadius;
  gl_Position = vec4(uv * 2.0 - 1.0, 0.0, 1.0);
}`;

const SPLAT_FS = `#version 300 es
precision highp float;
in vec2 vLocal;
uniform float uStrength;
out vec4 outColor;
void main() {
  float d = length(vLocal);
  if (d > 1.0) discard;
  float a = pow(1.0 - d, 2.2);
  outColor = vec4(vec3(a * uStrength), 1.0);
}`;

const DECAY_FS = `#version 300 es
precision highp float;
uniform float uDecay;
out vec4 outColor;
void main() {
  outColor = vec4(vec3(uDecay), 1.0);
}`;

export class GroundRenderer {
  constructor(gl, helpers, caps) {
    const { createProgram, getUniforms, RenderTarget, createFullscreenQuad, QUAD_VS } = helpers;
    this.gl = gl;

    this.prog = createProgram(gl, GROUND_VS, GROUND_FS, 'ground');
    this.u = getUniforms(gl, this.prog);

    this.splatProg = createProgram(gl, SPLAT_VS, SPLAT_FS, 'scorch-splat');
    this.splatU = getUniforms(gl, this.splatProg);

    this.decayProg = createProgram(gl, QUAD_VS, DECAY_FS, 'scorch-decay');
    this.decayU = getUniforms(gl, this.decayProg);

    this.quad = createFullscreenQuad(gl);

    this.vao = gl.createVertexArray();
    this.buf = gl.createBuffer();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, -1, 1, 1, -1, 1, 1,
    ]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.scorch = new RenderTarget(gl, caps, { float: false, linear: true, name: 'scorch' });
    this.scorch.resize(512, 512);
    this.scorchCleared = false;
    this.pendingSplats = [];
    this.decayFrame = 0;
    this.decayAccum = 0;

    this.lights = new Float32Array(MAX_LIGHTS * 4);
    this.lightSlots = [];
    for (let i = 0; i < MAX_LIGHTS; i++) {
      this.lightSlots.push({ x: 0, z: 0, birth: -1e9, life: 1, strength: 0, radius: 6 });
    }
  }

  // Newest impact replaces the dimmest slot so the strongest lights survive.
  addLight(x, z, strength, time) {
    let worst = 0;
    let worstVal = Infinity;
    for (let i = 0; i < MAX_LIGHTS; i++) {
      const s = this.lightSlots[i];
      const age = time - s.birth;
      const cur = age > s.life ? -1 : s.strength * (1 - age / s.life);
      if (cur < worstVal) { worstVal = cur; worst = i; }
    }
    const slot = this.lightSlots[worst];
    slot.x = x;
    slot.z = z;
    slot.birth = time;
    slot.life = 0.55 + strength * 0.9;
    slot.strength = strength;
    slot.radius = 4 + strength * 9;
  }

  addScorch(x, z, strength, extent) {
    this.pendingSplats.push({
      u: (x / extent) * 0.5 + 0.5,
      v: (z / extent) * 0.5 + 0.5,
      r: (0.004 + 0.02 * strength),
      s: 0.35 + strength * 0.55,
    });
  }

  // Runs before the scene pass: fade existing scorch, then add new splats.
  updateScorch(dt, enabled) {
    const gl = this.gl;
    if (!enabled) {
      this.pendingSplats.length = 0;
      return 0;
    }

    let calls = 0;
    this.scorch.bind({ clear: !this.scorchCleared });
    this.scorchCleared = true;

    // dst = dst * src : a multiply-only pass, cheaper than a read/modify/write.
    // Run on alternate frames with a doubled step; the fade is slow enough that
    // halving its rate is invisible and it halves the pass count.
    this.decayAccum += dt;
    this.decayFrame = (this.decayFrame + 1) & 1;
    if (this.decayFrame === 0) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ZERO, gl.SRC_COLOR);
      gl.useProgram(this.decayProg);
      gl.uniform1f(this.decayU.uDecay, Math.pow(0.984, this.decayAccum * 60));
      this.quad.draw();
      this.decayAccum = 0;
      calls++;
    }

    if (this.pendingSplats.length) {
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(this.splatProg);
      gl.bindVertexArray(this.vao);
      for (const s of this.pendingSplats) {
        gl.uniform2f(this.splatU.uCenter, s.u, s.v);
        gl.uniform1f(this.splatU.uRadius, s.r);
        gl.uniform1f(this.splatU.uStrength, s.s);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        calls++;
      }
      this.pendingSplats.length = 0;
    }
    return calls;
  }

  draw(camera, time, dt, cfg, flash) {
    const gl = this.gl;
    const u = this.u;

    for (let i = 0; i < MAX_LIGHTS; i++) {
      const s = this.lightSlots[i];
      const age = time - s.birth;
      const k = i * 4;
      if (age < 0 || age > s.life) {
        this.lights[k + 2] = 0;
        continue;
      }
      const fall = Math.exp(-3.4 * (age / s.life));
      this.lights[k] = s.x;
      this.lights[k + 1] = s.z;
      this.lights[k + 2] = s.strength * fall;
      this.lights[k + 3] = s.radius * (1 + age * 0.7);
    }

    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    gl.uniformMatrix4fv(u.uMVP, false, camera.mvp);
    gl.uniform1f(u.uExtent, cfg.ground.extent);
    gl.uniform1f(u.uCell, cfg.ground.cell);
    gl.uniform1f(u.uFogDensity, cfg.ground.fogDensity);
    gl.uniform1f(u.uGridBrightness, cfg.ground.gridBrightness);
    gl.uniform1f(u.uTime, time);
    gl.uniform1f(u.uFlash, flash);
    gl.uniform3fv(u.uVoid, cfg.palette.void);
    gl.uniform3fv(u.uGrid, cfg.palette.grid);
    gl.uniform3fv(u.uHalo, cfg.palette.halo);
    gl.uniform3fv(u.uCore, cfg.palette.core);
    gl.uniform4fv(u.uLights, this.lights);
    gl.uniform1f(u.uScorchAmount, cfg.effects.scorch ? 0.9 : 0.0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.scorch.tex);
    gl.uniform1i(u.uScorch, 0);

    gl.disable(gl.BLEND);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return 1;
  }
}
