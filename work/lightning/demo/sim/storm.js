// Storm director.
/*
 Strikes are not fired on a fixed interval: the storm walks a state machine
 (idle, building, active, decay) with randomized durations, and re-rolls its
 visual character every cycle. That is what stops the wallpaper from reading as
 a loop - the rhythm and the look both keep changing.
*/
import { rollCharacter } from './bolt.js';
import { mixSeed } from '../core/prng.js';

const PHASES = {
  idle:     { dur: [2.5, 7.0], interval: null,        scale: [0, 0],        flicker: 0.22 },
  building: { dur: [3.0, 9.0], interval: [1.4, 3.6],  scale: [0.55, 0.85],  flicker: 0.55 },
  active:   { dur: [6.0, 20.0], interval: [0.35, 1.5], scale: [0.85, 1.35], flicker: 0.3 },
  decay:    { dur: [3.0, 8.0], interval: [1.5, 4.2],  scale: [0.45, 0.8],  flicker: 0.35 },
};

const NEXT_PHASE = { idle: 'building', building: 'active', active: 'decay', decay: 'idle' };

export class Storm {
  constructor(cfg, rng, host) {
    this.cfg = cfg;
    this.rng = rng;
    this.host = host;

    this.character = rollCharacter(rng);
    this.phase = 'building';
    this.phaseEnd = 0;
    this.nextStrike = 0;
    this.burst = 0;
    this.strikeIndex = 0;
    this.started = false;

    this.cursor = { x: 0, y: 0, speed: 0, active: false };
    this.cursorArcCooldown = 0;

    // Click-to-strike bookkeeping: a floor between strikes and a sliding
    // one-second budget.
    this.lastForced = -Infinity;
    this.forcedTimes = [];
    this.forcedBudget = 8;

    this._ground = [0, 0];
  }

  setConfig(cfg) {
    this.cfg = cfg;
  }

  setCursor(nx, ny) {
    const c = this.cursor;
    if (c.active) {
      c.speed = Math.hypot(nx - c.x, ny - c.y);
    }
    c.x = nx;
    c.y = ny;
    c.active = true;
  }

  enterPhase(time, phase) {
    const spec = PHASES[phase];
    const density = Math.max(0.15, this.cfg.storm.density);
    this.phase = phase;
    this.phaseEnd = time + this.rng.range(spec.dur[0], spec.dur[1]) / Math.sqrt(density);
    if (phase === 'building') this.character = rollCharacter(this.rng);
    this.scheduleStrike(time);
  }

  scheduleStrike(time) {
    const spec = PHASES[this.phase];
    if (!spec.interval) {
      this.nextStrike = Infinity;
      return;
    }
    const density = Math.max(0.15, this.cfg.storm.density);
    this.nextStrike = time + this.rng.range(spec.interval[0], spec.interval[1]) / density;
  }

  // Picks a ground target, optionally pulled toward the cursor.
  pickTarget(time, out) {
    const extent = this.cfg.ground.extent * 0.6;
    const ang = this.rng.unit() * Math.PI * 2;
    const rad = Math.sqrt(this.rng.unit()) * extent;
    out[0] = Math.cos(ang) * rad;
    out[1] = Math.sin(ang) * rad;

    const c = this.cursor;
    if (!this.cfg.effects.mouseReactive || !c.active) return out;
    if (!this.rng.bool(0.5)) return out;

    this.host.groundFromScreen(c.x, c.y, this._ground);
    const w = this.rng.range(0.45, 0.95);
    out[0] += (this._ground[0] - out[0]) * w + this.rng.range(-3, 3);
    out[1] += (this._ground[1] - out[1]) * w + this.rng.range(-3, 3);
    return out;
  }

  fire(time, scale) {
    const cfg = this.cfg;
    const target = this.pickTarget(time, [0, 0]);
    const h = this.rng.range(cfg.storm.spawnHeight[0], cfg.storm.spawnHeight[1]);

    this.strikeIndex++;
    this.host.emitStrike({
      time,
      target,
      origin: [
        target[0] + this.rng.range(-16, 16),
        h,
        target[1] + this.rng.range(-16, 16),
      ],
      scale,
      boltSeed: mixSeed(this.strikeIndex, cfg.seed) / 4294967296,
      character: this.character,
    });
  }

  /// Drives a strike into an exact screen position on demand, ignoring the phase
  /// schedule and the cursor-arc cooldown. Used by click-to-strike, so it has to
  /// fire every time - the only limits are a short floor between strikes and a
  /// per-second budget, which exist so holding down the mouse cannot flood the
  /// frame with overlapping bolts.
  ///
  /// Nothing here can be rejected by the segment cap: the renderer's ring buffer
  /// evicts its oldest segments, so a forced strike always makes it in.
  forceStrike(time, nx, ny) {
    if (time - this.lastForced < 0.06) return false;

    // Drop expired entries from the sliding window.
    let live = 0;
    for (let i = 0; i < this.forcedTimes.length; i++) {
      if (time - this.forcedTimes[i] < 1) this.forcedTimes[live++] = this.forcedTimes[i];
    }
    this.forcedTimes.length = live;
    if (live >= this.forcedBudget) return false;

    this.forcedTimes.push(time);
    this.lastForced = time;

    this.host.groundFromScreen(nx, ny, this._ground);
    const gx = this._ground[0];
    const gz = this._ground[1];
    const rng = this.rng;

    this.strikeIndex++;
    this.host.emitStrike({
      time,
      target: [gx, gz],
      origin: [
        gx + rng.range(-11, 11),
        rng.range(this.cfg.storm.spawnHeight[0], this.cfg.storm.spawnHeight[1]),
        gz + rng.range(-11, 11),
      ],
      // Deliberately heavier than an ambient strike: a click should land.
      scale: rng.range(1.1, 1.45),
      boltSeed: mixSeed(this.strikeIndex, this.cfg.seed ^ 0x27d4eb2f) / 4294967296,
      character: this.character,
      forced: true,
    });
    return true;
  }

  update(time, dt) {
    if (!this.started) {
      this.started = true;
      this.enterPhase(time, 'building');
    }

    const spec = PHASES[this.phase];

    // Distant sheet flashes with no visible channel: cheap depth cue, and it
    // makes the storm feel bigger than the frame.
    if (spec.flicker > 0 && this.rng.bool(spec.flicker * dt)) {
      this.host.flash(this.rng.range(0.03, 0.13), time);
    }

    if (time >= this.nextStrike) {
      this.fire(time, this.rng.range(spec.scale[0], spec.scale[1]));

      if (this.burst > 0) {
        this.burst--;
        this.nextStrike = time + this.rng.range(0.05, 0.22);
      } else {
        if (this.phase === 'active' && this.rng.bool(0.28)) this.burst = this.rng.int(1, 3);
        this.scheduleStrike(time);
      }
    }

    // A quick cursor flick can pull a small arc to the pointer.
    this.cursorArcCooldown -= dt;
    const c = this.cursor;
    if (this.cfg.effects.mouseReactive && c.active && this.cursorArcCooldown <= 0 && c.speed > 0.06) {
      this.cursorArcCooldown = this.rng.range(0.7, 2.4);
      this.host.groundFromScreen(c.x, c.y, this._ground);
      this.strikeIndex++;
      this.host.emitStrike({
        time,
        target: [this._ground[0], this._ground[1]],
        origin: [
          this._ground[0] + this.rng.range(-6, 6),
          this.rng.range(9, 18),
          this._ground[1] + this.rng.range(-6, 6),
        ],
        scale: 0.4,
        boltSeed: mixSeed(this.strikeIndex, this.cfg.seed ^ 0x5bf03635) / 4294967296,
        character: this.character,
      });
    }
    c.speed *= Math.max(0, 1 - dt * 6);

    if (time >= this.phaseEnd) this.enterPhase(time, NEXT_PHASE[this.phase]);
  }
}
