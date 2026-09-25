/*
 Fixed size spark pool. All storage is preallocated typed arrays and the hot
 loop allocates nothing, so the particle system never triggers GC.
*/
const STRIDE = 7; // px, py, pz, size, birth, life, heat

export class Sparks {
  constructor(capacity = 2048) {
    this.capacity = capacity;
    this.px = new Float32Array(capacity);
    this.py = new Float32Array(capacity);
    this.pz = new Float32Array(capacity);
    this.vx = new Float32Array(capacity);
    this.vy = new Float32Array(capacity);
    this.vz = new Float32Array(capacity);
    this.age = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.size = new Float32Array(capacity);
    this.heat = new Float32Array(capacity);
    this.alive = new Uint8Array(capacity);

    this.cursor = 0;
    this.count = 0;
    this.instances = new Float32Array(capacity * STRIDE);
    this.instanceCount = 0;
  }

  reset() {
    this.alive.fill(0);
    this.count = 0;
    this.instanceCount = 0;
  }

  // Oldest-slot-wins allocation: a burst during a heavy storm recycles the
  // dimmest sparks rather than being dropped.
  spawn(rng, x, y, z, n, speed, heat) {
    for (let i = 0; i < n; i++) {
      const idx = this.cursor;
      this.cursor = (this.cursor + 1) % this.capacity;
      if (!this.alive[idx]) this.count++;

      const theta = rng.unit() * Math.PI * 2;
      const phi = Math.acos(rng.range(-0.15, 1.0)); // biased upward and outward
      const s = speed * rng.range(0.35, 1.0);

      this.px[idx] = x; this.py[idx] = y; this.pz[idx] = z;
      this.vx[idx] = Math.sin(phi) * Math.cos(theta) * s;
      this.vy[idx] = Math.cos(phi) * s;
      this.vz[idx] = Math.sin(phi) * Math.sin(theta) * s;
      this.age[idx] = 0;
      this.life[idx] = rng.range(0.35, 1.4);
      this.size[idx] = rng.range(0.9, 2.6);
      this.heat[idx] = heat * rng.range(0.6, 1.0);
      this.alive[idx] = 1;
    }
  }

  update(dt) {
    if (this.count === 0) {
      this.instanceCount = 0;
      return;
    }
    const drag = Math.max(0, 1 - dt * 1.6);
    const g = 26 * dt;
    let write = 0;
    let alive = 0;
    const inst = this.instances;

    for (let i = 0; i < this.capacity; i++) {
      if (!this.alive[i]) continue;

      const age = this.age[i] + dt;
      if (age >= this.life[i]) {
        this.alive[i] = 0;
        continue;
      }
      this.age[i] = age;

      this.vy[i] -= g;
      this.vx[i] *= drag; this.vy[i] *= drag; this.vz[i] *= drag;
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;

      // Sparks skitter along the ground instead of sinking through it.
      if (this.py[i] < 0.05) {
        this.py[i] = 0.05;
        this.vy[i] = Math.abs(this.vy[i]) * 0.28;
        this.vx[i] *= 0.7; this.vz[i] *= 0.7;
      }

      inst[write] = this.px[i];
      inst[write + 1] = this.py[i];
      inst[write + 2] = this.pz[i];
      inst[write + 3] = this.size[i];
      inst[write + 4] = age;
      inst[write + 5] = this.life[i];
      inst[write + 6] = this.heat[i];
      write += STRIDE;
      alive++;
    }

    this.count = alive;
    this.instanceCount = alive;
  }
}

export const SPARK_STRIDE = STRIDE;
