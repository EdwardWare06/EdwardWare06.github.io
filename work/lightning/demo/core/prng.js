/* 
Deterministic PRNG. Every visual in the scene is a pure function of a seed,
 so a storm can be replayed exactly for debugging while still never repeating
 during normal use.
*/

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  constructor(seed) {
    this.next = mulberry32(seed);
  }

  // Uniform in [0, 1).
  unit() {
    return this.next();
  }

  range(lo, hi) {
    return lo + (hi - lo) * this.next();
  }

  int(lo, hi) {
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }

  bool(p) {
    return this.next() < p;
  }

  sign() {
    return this.next() < 0.5 ? -1 : 1;
  }

  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }

  // Approximately standard normal (sum of uniforms, cheap and allocation free).
  norm() {
    return (this.next() + this.next() + this.next() + this.next() - 2) * 1.1547;
  }

  // Heavy tailed: most values small, occasional large excursion. This is what
  // gives lightning its characteristic mix of gentle wander and sharp kinks.
  lorentz(scale) {
    const u = this.next() * 0.98 + 0.01;
    return scale * Math.tan(Math.PI * (u - 0.5)) * 0.25;
  }

  reseed(seed) {
    this.next = mulberry32(seed);
    return this;
  }
}

// Mix two integers into a well distributed 32 bit seed.
export function mixSeed(a, b) {
  let h = (a ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (b >>> 0), 0x85ebca6b) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
