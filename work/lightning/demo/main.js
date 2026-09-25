/* Scene entry point: owns the render loop, the config/message bus, and the glue
   between the storm director, the geometry generator and the GPU passes.

   Draw order per frame:
     scorch decay + splats  ->  scene target: ground, reflected bolts, bolts,
     sparks  ->  bloom, afterglow, composite to the screen.
*/

import { DEFAULTS, mergeConfig } from './config.js';
import { Rng, mixSeed } from './core/prng.js';
import { IsoCamera } from './core/camera.js';
import {
  createContext, createProgram, getUniforms, RenderTarget,
  createFullscreenQuad, QUAD_VS,
} from './gl/context.js';
import { SegmentRenderer } from './gl/segments.js';
import { GroundRenderer } from './gl/ground.js';
import { SparkRenderer } from './gl/sparks-renderer.js';
import { PostChain } from './gl/post.js';
import { Sparks } from './sim/sparks.js';
import { Storm } from './sim/storm.js';
import { generateStrike } from './sim/bolt.js';

const helpers = { createProgram, getUniforms, RenderTarget, createFullscreenQuad, QUAD_VS };
const inWebView = !!(window.chrome && window.chrome.webview);

class Scene {
  constructor(canvas) {
    this.canvas = canvas;
    this.cfg = mergeConfig(DEFAULTS, {});
    if (!this.cfg.seed) this.cfg.seed = (Math.random() * 0xffffffff) >>> 0;

    this.res = [1, 1];
    this.time = 0;
    this.flash = 0;
    this.pauseReasons = new Set();
    this.running = false;
    this.rafId = 0;
    this.lastFrame = 0;
    this.accum = 0;
    this.events = [];
    this.stats = { fps: 0, drawCalls: 0, segments: 0, sparks: 0 };
    this._fpsAccum = 0;
    this._fpsFrames = 0;

    this.rng = new Rng(this.cfg.seed);
    this.strikeRng = new Rng(this.cfg.seed ^ 0x1b873593);

    this.initGL();
    this.initSim();
    this.bindEvents();
    this.resize();
  }

  initGL() {
    const { gl, caps } = createContext(this.canvas);
    this.gl = gl;
    this.caps = caps;

    this.camera = new IsoCamera(this.cfg.camera);
    this.segments = new SegmentRenderer(gl, helpers, this.cfg.storm.maxSegments);
    this.ground = new GroundRenderer(gl, helpers, caps);
    this.sparkRenderer = new SparkRenderer(gl, helpers, 2048);
    this.post = new PostChain(gl, helpers, caps, this.cfg);
  }

  initSim() {
    this.sparks = new Sparks(2048);
    this.storm = new Storm(this.cfg, this.rng, {
      emitStrike: (opts) => this.emitStrike(opts),
      flash: (strength) => this.addFlash(strength),
      groundFromScreen: (nx, ny, out) => this.camera.screenToGround(nx, ny, out),
    });
  }

  bindEvents() {
    window.addEventListener('resize', () => this.resize());

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.pause('hidden');
      else this.resume('hidden');
    });

    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.running = false;
      cancelAnimationFrame(this.rafId);
    }, false);

    this.canvas.addEventListener('webglcontextrestored', () => {
      this.initGL();
      this.segments.reset();
      this.sparks.reset();
      this.resize();
      this.start();
    }, false);

    if (inWebView) {
      window.chrome.webview.addEventListener('message', (e) => this.onHostMessage(e.data));
    } else {
      // Standalone browser testing: the click-through wallpaper window cannot
      // receive real mouse events, so the shell feeds cursor position instead.
      window.addEventListener('mousemove', (e) => {
        this.storm.setCursor(
          (e.clientX / window.innerWidth) * 2 - 1,
          1 - (e.clientY / window.innerHeight) * 2,
        );
      });
    }
  }

  onHostMessage(msg) {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.type) {
      case 'config':
        this.applyConfig(msg.config);
        break;
      case 'cursor':
        this.storm.setCursor(msg.x, msg.y);
        break;
      case 'strike':
        this.storm.forceStrike(this.time, msg.x, msg.y);
        break;
      case 'pause':
        this.pause('host');
        break;
      case 'resume':
        this.resume('host');
        break;
      case 'reseed':
        this.reseed(msg.seed);
        break;
      default:
        break;
    }
  }

  applyConfig(patch) {
    const prevCapacity = this.cfg.storm.maxSegments;
    this.cfg = mergeConfig(this.cfg, patch);
    if (!this.cfg.seed) this.cfg.seed = (Math.random() * 0xffffffff) >>> 0;

    this.camera.cfg = this.cfg.camera;
    this.storm.setConfig(this.cfg);

    if (this.cfg.storm.maxSegments !== prevCapacity) {
      this.segments = new SegmentRenderer(this.gl, helpers, this.cfg.storm.maxSegments);
    }
    this.resize();
  }

  reseed(seed) {
    this.cfg.seed = (seed >>> 0) || ((Math.random() * 0xffffffff) >>> 0);
    this.rng.reseed(this.cfg.seed);
    this.strikeRng.reseed(this.cfg.seed ^ 0x1b873593);
    this.segments.reset();
    this.sparks.reset();
    this.events.length = 0;
    this.storm = new Storm(this.cfg, this.rng, {
      emitStrike: (opts) => this.emitStrike(opts),
      flash: (strength) => this.addFlash(strength),
      groundFromScreen: (nx, ny, out) => this.camera.screenToGround(nx, ny, out),
    });
  }

  resize() {
    const scale = this.cfg.quality === 'low' ? 0.72 : 1;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(window.innerWidth * dpr * scale));
    const h = Math.max(1, Math.round(window.innerHeight * dpr * scale));

    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.res[0] = w;
    this.res[1] = h;
    this.camera.resize(w, h);
    this.post.resize(w, h);
  }

  addFlash(strength) {
    this.flash = Math.min(1.8, this.flash + strength);
  }

  // Builds the geometry for one strike and queues its timed side effects
  // (impact lights, scorch, sparks, flash) for when the leader actually
  // arrives rather than when the strike was scheduled.
  emitStrike(opts) {
    const seedInt = Math.round(opts.boltSeed * 4294967296) >>> 0;
    this.strikeRng.reseed(mixSeed(seedInt, this.cfg.seed));

    const result = generateStrike(this.strikeRng, this.cfg.storm, opts.character, this.segments, {
      time: opts.time,
      origin: opts.origin,
      target: opts.target,
      scale: opts.scale,
      boltSeed: opts.boltSeed,
    });

    this.addFlash(result.flash * 0.12);

    for (let i = 0; i < result.impacts.length; i++) {
      const im = result.impacts[i];
      this.events.push({
        t: im.t,
        kind: 'impact',
        x: im.x,
        z: im.z,
        strength: im.strength * (opts.scale || 1),
        flash: i === 0 ? result.flash : 0,
      });
    }

    if (this.cfg.effects.sparks) {
      for (let i = 0; i + 3 < result.tips.length; i += 4) {
        this.events.push({
          t: result.tips[i + 3],
          kind: 'tip',
          x: result.tips[i],
          y: result.tips[i + 1],
          z: result.tips[i + 2],
        });
      }
    }

    this.stats.segments = result.segments;
  }

  processEvents(time) {
    const events = this.events;
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i];
      if (e.t > time) continue;
      events.splice(i, 1);

      if (e.kind === 'impact') {
        this.ground.addLight(e.x, e.z, e.strength, time);
        if (this.cfg.effects.scorch) {
          this.ground.addScorch(e.x, e.z, e.strength, this.cfg.ground.extent);
        }
        if (e.flash > 0) this.addFlash(e.flash);
        if (this.cfg.effects.sparks) {
          this.sparks.spawn(
            this.rng, e.x, 0.2, e.z,
            Math.round(10 + e.strength * 30),
            8 + e.strength * 12,
            1.0,
          );
        }
      } else if (e.kind === 'tip' && this.cfg.effects.sparks) {
        this.sparks.spawn(this.rng, e.x, e.y, e.z, this.rng.int(1, 3), 5, 0.55);
      }
    }

    // Safety valve: a stalled queue would leak memory.
    if (events.length > 4096) events.length = 0;
  }

  update(dt) {
    this.time += dt;
    const time = this.time;

    this.storm.update(time, dt);
    this.processEvents(time);
    this.sparks.update(dt);
    this.camera.update(time);

    this.flash *= Math.exp(-dt * 4.2);
    if (this.flash < 1e-4) this.flash = 0;
  }

  render(dt) {
    const gl = this.gl;
    const cfg = this.cfg;
    let calls = 0;

    calls += this.ground.updateScorch(dt, cfg.effects.scorch);

    this.segments.flush(this.time);
    this.post.beginScene(cfg.palette.void);

    calls += this.ground.draw(this.camera, this.time, dt, cfg, Math.min(1, this.flash));

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);

    if (cfg.effects.reflection) {
      calls += this.segments.draw(this.camera, this.time, this.res, cfg.palette, {
        mirror: true,
        intensity: 0.22,
        haloScale: 2.4,
      });
    }

    calls += this.segments.draw(this.camera, this.time, this.res, cfg.palette, {
      mirror: false,
      intensity: 1,
      haloScale: 1,
    });

    if (cfg.effects.sparks) {
      calls += this.sparkRenderer.draw(this.sparks, this.camera, this.res, cfg.palette);
    }

    gl.disable(gl.BLEND);
    calls += this.post.run(cfg, this.time, Math.min(1.4, this.flash), this.res[0], this.res[1]);

    this.stats.drawCalls = calls;
    this.stats.sparks = this.sparks.count;
  }

  frame(now) {
    if (!this.running) return;
    this.rafId = requestAnimationFrame((t) => this.frame(t));

    const nowSec = now * 0.001;
    let dt = nowSec - this.lastFrame;
    this.lastFrame = nowSec;
    if (!isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, 0.1); // never simulate a huge step after a stall

    // Frame pacing: skip work when running ahead of the configured cap.
    const cap = Math.max(15, this.cfg.fpsCap || 60);
    this.accum += dt;
    if (this.accum < (1 / cap) - 0.0015) return;
    const step = this.accum;
    this.accum = 0;

    this.update(step);
    this.render(step);

    this._fpsAccum += step;
    this._fpsFrames++;
    if (this._fpsAccum >= 1) {
      this.stats.fps = Math.round(this._fpsFrames / this._fpsAccum);
      this._fpsAccum = 0;
      this._fpsFrames = 0;
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastFrame = performance.now() * 0.001;
    this.accum = 0;
    this.rafId = requestAnimationFrame((t) => this.frame(t));
  }

  // Pausing is reason based: the host suspending us and the page being hidden are
  // independent, and the loop only restarts once every reason is cleared.
  pause(reason = 'host') {
    this.pauseReasons.add(reason);
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  resume(reason = 'host') {
    this.pauseReasons.delete(reason);
    if (this.pauseReasons.size > 0) return;
    this.start();
  }
}

const canvas = document.getElementById('scene');
let scene = null;

try {
  scene = new Scene(canvas);
  scene.start();
} catch (err) {
  // A visible failure beats a black rectangle nobody can debug.
  const el = document.getElementById('fallback');
  el.textContent = `lightning background failed to start: ${err.message}`;
  el.style.display = 'block';
  if (inWebView) window.chrome.webview.postMessage({ type: 'error', message: String(err) });
}

// Debug/host handle.
window.LBG = {
  scene,
  stats: () => scene && scene.stats,
  config: (patch) => scene && scene.applyConfig(patch),
  reseed: (seed) => scene && scene.reseed(seed),
  // Screen coords are -1..1 with +y up, same as the shell sends.
  strike: (x = 0, y = 0) => scene && scene.storm.forceStrike(scene.time, x, y),
  pause: () => scene && scene.pause(),
  resume: () => scene && scene.resume(),
};

if (inWebView) window.chrome.webview.postMessage({ type: 'ready' });
