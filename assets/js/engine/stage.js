// The stage: one WebGL2 particle system that changes form. Ported from the approved prototype.
import { createContext, program, programsDone, checkLinked, texture, framebuffer, accumulation, freeTarget } from './gl.js';
import { VSQ, UPDATE_FS, RENDER_VS, POINT_FS, FADE_FS, BRAIN_FS, DISPLAY_FS } from './shaders.js';
import { FORM, CAMERA, TRAIL_FADE } from './forms.js';
import { TIERS, FrameMeter } from './quality.js';
import { smooth, lerpAngle } from '../lib/math.js';

const TRANSITION = 2.6;                  // seconds for one form to morph into the next
const PULSAR_TILT = 1.1, PULSAR_SPIN = 1.8;
const BASE_COUNT = 512 * 512;            // brightness is tuned for this many particles
const SUN_VIEW = norm([-0.6, 0.45, -0.65]); // storm planet light, fixed to the camera

// The pulsar's magnetic axis at time t (it spins around a tilted axis).
function pulsarAxis(t) { return [Math.sin(PULSAR_TILT) * Math.cos(PULSAR_SPIN * t), Math.cos(PULSAR_TILT), Math.sin(PULSAR_TILT) * Math.sin(PULSAR_SPIN * t)]; }
function norm(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
function randDir() { const z = Math.random() * 2 - 1, r = Math.sqrt(1 - z * z), a = Math.random() * Math.PI * 2; return [r * Math.cos(a), z, r * Math.sin(a)]; }
// view rotation = Rx(pitch, looking down) * Ry(yaw), as rows
function viewRows(yaw, pitch) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  return [[cy, 0, sy], [-sp * sy, cp, sp * cy], [-cp * sy, -sp, cp * cy]];
}

export class Stage {
  constructor(canvas, { tier = 'high', onFlash = () => {} } = {}) {
    const gl = createContext(canvas);
    if (!gl) throw new Error('WebGL2 with float render targets is not available');
    this.gl = gl; this.canvas = canvas; this.onFlash = onFlash;
    this.progs = {
      upd: program(gl, VSQ, UPDATE_FS), ren: program(gl, RENDER_VS, POINT_FS), fade: program(gl, VSQ, FADE_FS),
      brain: program(gl, VSQ, BRAIN_FS), disp: program(gl, VSQ, DISPLAY_FS)
    };
    this.ext = gl.getExtension('KHR_parallel_shader_compile');
    this.phase = 'compile'; // compile → prime → warm (see _prepare)
    this.s = {
      // t starts at 12 s so the warm-up can settle on the times just before it, never below zero
      cur: FORM.GALAXY, prev: FORM.GALAXY, sw: -99, t: 12, yaw: 0.6, pyaw: 0.3,
      off: 0.3, offT: 0.3, offPin: null, zoom: 1, zoomT: 1, sky: 1, skyT: 1, sing: 0.035, singT: 0.035,
      kick: 0, reset: false, dim: 1, speed: 1, cuts: false, reduced: false,
      pulseArmed: true, sflash: 0, nextFl: 0, nextBig: 0, cluster: [0, 0, 1], clusterN: 0, flI: 0
    };
    this.FL = new Float32Array(24).fill(-100); // storm flash slots: xyz direction + start time
    this.FI = new Float32Array(6).fill(1);     // storm flash intensities
    this.meter = new FrameMeter(90);
    this.W = 0; this.H = 0; this.dpr = 1; this.acc = null; this.cols = 0; this.rows = 0;
    this.ready = false; this.running = false; this.from = null; this.visible = !document.hidden; this.onScreen = true;
    this.setTier(tier);
    new ResizeObserver(() => this._resize(false)).observe(canvas);
    new IntersectionObserver(es => { this.onScreen = es[es.length - 1].isIntersecting; }).observe(canvas);
    document.addEventListener('visibilitychange', () => { this.visible = !document.hidden; this._last = performance.now(); });
    this._loop = this._loop.bind(this);
  }

  get form() { return this.s.cur; }
  get count() { return this.cols * this.rows; }

  /* ---------- public API ---------- */
  start() { if (this.running) return; this.running = true; this._last = performance.now(); requestAnimationFrame(this._loop); }
  stop() { this.running = false; }
  setTier(name) {
    const T = TIERS[name];
    if (!T) throw new Error(`unknown quality tier "${name}"`);
    this.tier = name; this.dprCap = T.dpr;
    if (T.cols !== this.cols || T.rows !== this.rows) { this._allocState(T.cols, T.rows); this.ready = false; }
    this._resize(true);
  }
  setForm(f) {
    const s = this.s;
    if (f === s.cur) return;
    if (s.cuts) { this.snap(f); return; }
    // An interrupted morph starts from wherever the blend is now, so the camera and lens never jump.
    // The particles keep the form that dominates the picture as their starting point.
    const m = smooth((s.t - s.sw) / TRANSITION);
    this.from = this._weights(m);
    if (m >= 0.5) s.prev = s.cur;
    s.cur = f; s.sw = s.t; s.reset = true;
    if (f === FORM.PLANET) s.pyaw = this._planetYaw();
    if (!s.reduced) this.onFlash(260, 'form');
  }
  snap(f) {
    const s = this.s;
    s.prev = f; s.cur = f; s.sw = s.t - 10; s.reset = true; this.from = null;
    if (f === FORM.PLANET) s.pyaw = this._planetYaw();
    if (this.ready) this._settle(150);
  }
  kick(v) { this.s.kick = v; }
  sky(a, now = false) { this.s.skyT = a; if (now) this.s.sky = a; }
  sing(r, now = false) { this.s.singT = r; if (now) this.s.sing = r; }
  pinOffset(v) { this.s.offPin = v; if (v != null) this.s.off = v; }
  layout(off, zoom) { this.s.offT = off; this.s.zoomT = zoom; }
  dim(v) { this.s.dim = v; }
  motion({ speed = 1, cuts = false, reduced = false } = {}) { Object.assign(this.s, { speed, cuts, reduced }); }
  frameMs() { return this.meter.avg; }
  stats() { return { form: this.s.cur, tier: this.tier, count: this.count, ready: this.ready, frameMs: this.meter.avg }; }

  // Average brightness of the trail buffer (mip 4). Tests use it to catch black, NaN or blown-out frames.
  debugLuma() {
    const gl = this.gl, lvl = 4, w = Math.max(1, this.W >> lvl), h = Math.max(1, this.H >> lvl);
    const f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.acc.t, lvl);
    const px = new Float32Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(f);
    let sum = 0;
    for (let i = 0; i < w * h; i++) sum += px[i * 4] * 0.3 + px[i * 4 + 1] * 0.5 + px[i * 4 + 2] * 0.2;
    return sum / (w * h);
  }

  /* ---------- internals ---------- */
  // Weight of each form in the picture at morph progress m.
  _weights(m) {
    const s = this.s, w = new Array(CAMERA.length).fill(0);
    if (this.from) for (let i = 0; i < w.length; i++) w[i] = this.from[i] * (1 - m);
    else w[s.prev] += 1 - m;
    w[s.cur] += m;
    return w;
  }

  // planet: hold the one open-ring view (nearest full turn). The half-turn mirror is not equivalent:
  // the tilted ring opens the other way and reads as a dark ring behind a dim planet.
  _planetYaw() { const turn = Math.PI * 2; return 0.3 + turn * Math.round((this.s.yaw - 0.3) / turn); }

  _allocState(cols, rows) {
    const gl = this.gl, n = cols * rows;
    if (this.SP) {
      [...this.SP, ...this.SV, this.BRAIN].forEach(t => gl.deleteTexture(t));
      [...this.SF, this.BRAINF].forEach(f => gl.deleteFramebuffer(f));
    }
    const P = new Float32Array(n * 4), V = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const z = Math.random() * 2 - 1, r = Math.sqrt(1 - z * z) * Math.cbrt(Math.random()) * 1.1, a = Math.random() * Math.PI * 2;
      P[i * 4] = Math.cos(a) * r; P[i * 4 + 1] = z * 0.8; P[i * 4 + 2] = Math.sin(a) * r; P[i * 4 + 3] = -1; // w: birth time, -1 = never respawned
      V[i * 4 + 3] = Math.random() * 3;
    }
    const tex = data => texture(gl, cols, rows, { internal: gl.RGBA32F, format: gl.RGBA, type: gl.FLOAT, data });
    this.SP = [tex(P), tex(P)]; this.SV = [tex(V), tex(V)];
    this.SF = [framebuffer(gl, [this.SP[0], this.SV[0]]), framebuffer(gl, [this.SP[1], this.SV[1]])];
    this.BRAIN = tex(P); this.BRAINF = framebuffer(gl, [this.BRAIN]); this.brainDirty = true;
    this.si = 0; this.cols = cols; this.rows = rows;
  }

  _resize(force) {
    const r = this.canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, this.dprCap);
    const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
    if (!force && w === this.W && h === this.H) return;
    const gl = this.gl, old = this.acc, ow = this.W, oh = this.H;
    this.W = w; this.H = h; this.dpr = dpr; this.canvas.width = w; this.canvas.height = h;
    this.acc = accumulation(gl, w, h);
    if (old) {
      // keep the trails: scale the old buffer into the new one instead of starting from black
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, old.f); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.acc.f);
      gl.blitFramebuffer(0, 0, ow, oh, 0, 0, w, h, gl.COLOR_BUFFER_BIT, gl.LINEAR);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      freeTarget(gl, old);
    }
    // setting canvas.width cleared the picture; draw one now so a blank frame is never shown
    if (this.ready && this.running) this._frame(0);
  }

  // Run n update steps on the times leading up to now, so time-driven forms carry on smoothly afterwards.
  _settle(n, upTo = this.s.t) {
    for (let k = 0; k < n; k++) { const t = upTo - (n - k) / 60; this._step(1 / 60, t, 1, 0, pulsarAxis(t)); }
  }

  // First use of the shaders. A cold shader cache costs seconds: the driver compiles in the background,
  // then finishes the update shader at its first draw, which a fence reports without blocking.
  // The page keeps painting throughout; the warm-up runs once both are done.
  _prepare() {
    const gl = this.gl, progs = Object.values(this.progs);
    if (this.phase === 'compile') {
      if (!programsDone(gl, progs, this.ext)) return false;
      checkLinked(gl, progs);
      this._prime();
      this.fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      this.phase = 'prime';
      return false;
    }
    if (this.phase === 'prime') {
      if (gl.getSyncParameter(this.fence, gl.SYNC_STATUS) !== gl.SIGNALED) return false;
      gl.deleteSync(this.fence);
      this.fence = null;
      this.phase = 'warm';
    }
    this._warm();
    return true;
  }

  // Draw once with every shader into its real target, so the driver finishes compiling all of them.
  // Zero fade and zero point intensity: nothing is added to the trails.
  _prime() {
    const gl = this.gl, P = this.progs, s = this.s;
    this._step(1 / 60, s.t, 1, 0, pulsarAxis(s.t));
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.acc.f); gl.viewport(0, 0, this.W, this.H);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ZERO, gl.SRC_COLOR);
    gl.useProgram(P.fade.p); gl.uniform1f(P.fade.u.uF, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.blendFunc(gl.ONE, gl.ONE); gl.useProgram(P.ren.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.SP[this.si]); gl.uniform1i(P.ren.u.uP, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.SV[this.si]); gl.uniform1i(P.ren.u.uV, 1);
    gl.uniform1i(P.ren.u.uW, this.cols); gl.uniform1f(P.ren.u.uI, 0);
    gl.drawArrays(gl.POINTS, 0, 1);
    // the display pass goes to a small offscreen target: a draw to the canvas would make the page wait for it
    const t = texture(gl, 4, 4, { internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE }), f = framebuffer(gl, [t]);
    gl.viewport(0, 0, 4, 4); gl.disable(gl.BLEND); gl.useProgram(P.disp.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.acc.t); gl.generateMipmap(gl.TEXTURE_2D); gl.uniform1i(P.disp.u.uAcc, 0);
    gl.uniform2f(P.disp.u.uRes, 4, 4); gl.uniform1f(P.disp.u.uSkyA, 0); gl.uniform1f(P.disp.u.uDim, 0); gl.uniform1f(P.disp.u.uFlash, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    freeTarget(gl, { t, f });
  }

  // Settle the current form before the first frame.
  _warm() {
    const gl = this.gl;
    this._settle(240);
    // The passes above are only queued. Wait for the GPU to run them, so `ready` means the next frame is not stalled.
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.SF[this.si]);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, new Float32Array(4));
    this.ready = true;
  }

  // The brain's targets depend only on the particle id: build them once for each state allocation.
  _buildBrain() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.BRAINF); gl.viewport(0, 0, this.cols, this.rows); gl.disable(gl.BLEND);
    gl.useProgram(this.progs.brain.p);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.brainDirty = false;
  }

  _step(dt, t, m, turb, mag) {
    const gl = this.gl, U = this.progs.upd, s = this.s;
    if (this.brainDirty) this._buildBrain();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.SF[1 - this.si]); gl.viewport(0, 0, this.cols, this.rows); gl.disable(gl.BLEND);
    gl.useProgram(U.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.SP[this.si]); gl.uniform1i(U.u.uP, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.SV[this.si]); gl.uniform1i(U.u.uV, 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.BRAIN); gl.uniform1i(U.u.uBrain, 2);
    gl.uniform1f(U.u.uT, t); gl.uniform1f(U.u.uDt, dt); gl.uniform1f(U.u.uMix, m); gl.uniform1f(U.u.uTurb, turb);
    gl.uniform1i(U.u.uF0, s.prev); gl.uniform1i(U.u.uF1, s.cur); gl.uniform3fv(U.u.uM, mag);
    gl.uniform1f(U.u.uReset, s.reset ? 1 : 0); gl.uniform1f(U.u.uSing, s.sing); gl.uniform1f(U.u.uKick, s.kick);
    s.reset = false; s.kick = 0;
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.si = 1 - this.si;
  }

  _loop(now) {
    if (!this.running) return;
    requestAnimationFrame(this._loop);
    const raw = (now - this._last) / 1000;
    this._last = now;
    if (!this.visible || !this.onScreen || !this.W) return;
    if (raw > 0 && raw < 0.25) this.meter.add(raw * 1000);
    // rAF can hand a timestamp from before start() or a visibility change; never step backwards
    const dt = Math.max(0, Math.min(0.05, raw)) * this.s.speed;
    this.s.t += dt;
    if (!this.ready && !this._prepare()) return;
    this._frame(dt);
  }

  _addFlash(d, t, i) {
    const k = this.s.flI;
    this.FL[k * 4] = d[0]; this.FL[k * 4 + 1] = d[1]; this.FL[k * 4 + 2] = d[2]; this.FL[k * 4 + 3] = t;
    this.FI[k] = i; this.s.flI = (k + 1) % 6;
  }

  // Storm planet lightning: small flashes cluster in storm cells; a big strike faces the camera.
  _storm(t, fwd, weight) {
    const s = this.s;
    if (t > s.nextFl) {
      if (s.clusterN <= 0) { s.cluster = randDir(); s.clusterN = 3 + ((Math.random() * 4) | 0); }
      const r = randDir();
      this._addFlash(norm([s.cluster[0] + r[0] * 0.12, s.cluster[1] + r[1] * 0.12, s.cluster[2] + r[2] * 0.12]), t, 0.5 + Math.random() * 0.8);
      s.clusterN--; s.nextFl = t + 0.1 + Math.random() * 0.45;
    }
    if (t > s.nextBig) {
      const r = randDir();
      this._addFlash(norm([r[0] * 0.5 - fwd[0], r[1] * 0.5 - fwd[1], r[2] * 0.5 - fwd[2]]), t, 2.4);
      s.nextBig = t + 2.4 + Math.random() * 1.6;
      if (weight > 0.5 && !s.reduced) { this.onFlash(130, 'lightning'); s.sflash = 1; }
    }
  }

  _frame(dt) {
    const gl = this.gl, s = this.s, t = s.t;
    s.sky += (s.skyT - s.sky) * Math.min(1, dt * 1.3);
    s.sing += (s.singT - s.sing) * Math.min(1, dt * 8);
    const offT = s.offPin != null ? s.offPin : s.offT;
    s.off += (offT - s.off) * Math.min(1, dt * 6);
    s.zoom += (s.zoomT - s.zoom) * Math.min(1, dt * 6);

    const m = smooth((t - s.sw) / TRANSITION);
    const w = this._weights(m);
    let pitch = 0, dist = 0, ys = 0, fade = 0;
    for (let i = 0; i < w.length; i++) {
      if (!w[i]) continue;
      pitch += w[i] * CAMERA[i].p; dist += w[i] * CAMERA[i].d; ys += w[i] * CAMERA[i].ys; fade += w[i] * TRAIL_FADE[i];
    }
    this.cam = { pitch, dist, fade, lens: w[FORM.BLACK_HOLE] }; // read by the browser checks
    s.yaw += dt * ys;
    const pyaw = s.pyaw + 0.035 * Math.sin(t * 0.25);
    if (w[FORM.PLANET] > 0.999) s.yaw = pyaw;
    const yaw = lerpAngle(s.yaw, pyaw, w[FORM.PLANET]);
    const R = viewRows(yaw, pitch);
    const colMajor = [R[0][0], R[1][0], R[2][0], R[0][1], R[1][1], R[2][1], R[0][2], R[1][2], R[2][2]];
    const fwd = R[2];
    const sun = [0, 1, 2].map(j => R[0][j] * SUN_VIEW[0] + R[1][j] * SUN_VIEW[1] + R[2][j] * SUN_VIEW[2]);

    // pulsar: a pulse when a beam points at the camera
    const mag = pulsarAxis(t);
    const cosang = -(mag[0] * fwd[0] + mag[1] * fwd[1] + mag[2] * fwd[2]);
    let pulse = Math.max(0, Math.min(1, (cosang - 0.93) / 0.065)) * w[FORM.PULSAR];
    if (pulse > 0.55 && s.pulseArmed) { s.pulseArmed = false; if (!s.reduced) this.onFlash(140, 'pulsar'); }
    if (pulse < 0.2) s.pulseArmed = true;
    if (w[FORM.PLANET] > 0.02) this._storm(t, fwd, w[FORM.PLANET]);
    s.sflash = Math.max(0, s.sflash - dt * 5);
    if (s.reduced) { pulse = 0; s.sflash = 0; }
    const turb = 0.9 * Math.exp(-(t - s.sw) * 1.6);

    this._step(dt, t, m, turb, mag);

    // trails: fade what is there, then add this frame's points
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.acc.f); gl.viewport(0, 0, this.W, this.H);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ZERO, gl.SRC_COLOR);
    gl.useProgram(this.progs.fade.p); gl.uniform1f(this.progs.fade.u.uF, fade);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    const Rn = this.progs.ren;
    gl.blendFunc(gl.ONE, gl.ONE); gl.useProgram(Rn.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.SP[this.si]); gl.uniform1i(Rn.u.uP, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.SV[this.si]); gl.uniform1i(Rn.u.uV, 1);
    gl.uniform1i(Rn.u.uW, this.cols); gl.uniform1i(Rn.u.uF0, s.prev); gl.uniform1i(Rn.u.uF1, s.cur);
    gl.uniform1f(Rn.u.uMix, m); gl.uniform1f(Rn.u.uT, t); gl.uniform1f(Rn.u.uAsp, this.W / this.H); gl.uniform1f(Rn.u.uPt, this.dpr);
    gl.uniform1f(Rn.u.uI, 0.045 * BASE_COUNT / this.count); gl.uniform1f(Rn.u.uDist, dist); gl.uniform1f(Rn.u.uFoc, dist / 1.2 / s.zoom);
    gl.uniform1f(Rn.u.uLens, w[FORM.BLACK_HOLE]); gl.uniform1f(Rn.u.uThE, 0.26 / s.zoom); gl.uniform1f(Rn.u.uOff, s.off);
    gl.uniformMatrix3fv(Rn.u.uR, false, colMajor); gl.uniform3fv(Rn.u.uFwd, fwd); gl.uniform3fv(Rn.u.uSun, sun);
    gl.uniform4fv(Rn.u['uFl[0]'], this.FL); gl.uniform1fv(Rn.u['uFi[0]'], this.FI);
    gl.uniform1i(Rn.u.uImg, 0); gl.drawArrays(gl.POINTS, 0, this.count);
    if (w[FORM.BLACK_HOLE] > 0.01) { gl.uniform1i(Rn.u.uImg, 1); gl.drawArrays(gl.POINTS, 0, this.count); } // lensed second image

    const D = this.progs.disp;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, this.W, this.H); gl.disable(gl.BLEND); gl.useProgram(D.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.acc.t); gl.generateMipmap(gl.TEXTURE_2D); gl.uniform1i(D.u.uAcc, 0);
    gl.uniform2f(D.u.uRes, this.W, this.H); gl.uniform2f(D.u.uSky, yaw * 0.15, pitch * 0.1);
    gl.uniform1f(D.u.uExp, 1.4); gl.uniform1f(D.u.uT, t); gl.uniform1f(D.u.uBloom, 0.5);
    gl.uniform1f(D.u.uFlash, Math.max(pulse, s.sflash)); gl.uniform1f(D.u.uSkyA, s.sky); gl.uniform1f(D.u.uDim, s.dim);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
