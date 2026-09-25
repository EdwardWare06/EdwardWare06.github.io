// Procedural lightning geometry.
/*
 A channel is a straight line roughened by recursive midpoint displacement:
 each midpoint is pushed sideways by a heavy tailed random amount proportional
 to the segment length, and the amount shrinks every subdivision level. That
 produces the mix of long smooth sweeps and sudden kinks real lightning has,
 which plain per-vertex noise does not.

 Branches recurse from channel nodes with a probability that decays with depth,
 inheriting the parent direction plus a random cone deviation. Anything that
 reaches the ground plane is truncated there, registers an impact, and may
 spread outward as flattened "spider" lightning.

 Segment birth times are derived from arc length divided by leader speed, so
 the renderer animates the strike growing outward from its origin for free.
*/
export const TIER_MAIN = 0;
export const TIER_BRANCH = 1;
export const TIER_CRAWL = 2;

const GROUND_Y = 0.02;

// Rolls the parameters that give one storm its character. Two storms with the
// same density can still look completely different: one all long forks and lazy
// wander, the next a tight jagged cluster.
export function rollCharacter(rng) {
  return {
    rough: rng.range(0.16, 0.42),        // tortuosity of every channel
    subdiv: rng.int(4, 6),               // midpoint displacement levels
    forkChance: rng.range(0.1, 0.34),    // branch spawn probability per node
    spread: rng.range(0.35, 1.05),       // branch cone half angle, radians
    downBias: rng.range(0.15, 0.75),     // how strongly branches head downward
    width: rng.range(1.5, 2.7),          // main channel core width
    lifeScale: rng.range(0.75, 1.5),
    crawlChance: rng.range(0.25, 0.8),   // ground spread on impact
    restrikes: rng.int(1, 4),
  };
}

// Roughened polyline between two points, returned as a flat [x,y,z,...] array.
function channel(rng, ax, ay, az, bx, by, bz, subdiv, rough) {
  let pts = [ax, ay, az, bx, by, bz];
  let amp = rough;

  for (let level = 0; level < subdiv; level++) {
    const next = [pts[0], pts[1], pts[2]];
    for (let i = 0; i + 5 < pts.length; i += 3) {
      const x0 = pts[i], y0 = pts[i + 1], z0 = pts[i + 2];
      const x1 = pts[i + 3], y1 = pts[i + 4], z1 = pts[i + 5];

      const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
      const len = Math.hypot(dx, dy, dz) || 1e-6;
      const ux = dx / len, uy = dy / len, uz = dz / len;

      // Random vector with the along-channel component projected out, so the
      // displacement is always perpendicular and never stretches the channel.
      let rx = rng.norm(), ry = rng.norm(), rz = rng.norm();
      const dot = rx * ux + ry * uy + rz * uz;
      rx -= ux * dot; ry -= uy * dot; rz -= uz * dot;
      const rlen = Math.hypot(rx, ry, rz) || 1e-6;

      const mag = (amp * len * Math.min(2.5, Math.abs(rng.lorentz(1.0)) + 0.35)) / rlen;

      next.push(
        (x0 + x1) * 0.5 + rx * mag,
        (y0 + y1) * 0.5 + ry * mag,
        (z0 + z1) * 0.5 + rz * mag,
        x1, y1, z1,
      );
    }
    pts = next;
    amp *= 0.58;
  }
  return pts;
}

function polylineLength(pts) {
  let total = 0;
  for (let i = 0; i + 5 < pts.length; i += 3) {
    total += Math.hypot(pts[i + 3] - pts[i], pts[i + 4] - pts[i + 1], pts[i + 5] - pts[i + 2]);
  }
  return total;
}

// Builds an orthonormal basis around a direction and returns a direction rotated
// off it by a random amount within `spread`.
function coneDeviate(rng, dx, dy, dz, spread, out) {
  const len = Math.hypot(dx, dy, dz) || 1e-6;
  const ux = dx / len, uy = dy / len, uz = dz / len;

  // Any vector not parallel to u works as a seed for the basis.
  let ax = 0, ay = 1, az = 0;
  if (Math.abs(uy) > 0.9) { ax = 1; ay = 0; az = 0; }

  let p1x = ay * uz - az * uy;
  let p1y = az * ux - ax * uz;
  let p1z = ax * uy - ay * ux;
  const p1l = Math.hypot(p1x, p1y, p1z) || 1e-6;
  p1x /= p1l; p1y /= p1l; p1z /= p1l;

  const p2x = uy * p1z - uz * p1y;
  const p2y = uz * p1x - ux * p1z;
  const p2z = ux * p1y - uy * p1x;

  const theta = Math.min(1.45, Math.abs(rng.norm()) * spread * 0.7 + spread * 0.35);
  const phi = rng.unit() * Math.PI * 2;
  const st = Math.sin(theta), ct = Math.cos(theta);
  const cp = Math.cos(phi), sp = Math.sin(phi);

  out[0] = ux * ct + (p1x * cp + p2x * sp) * st;
  out[1] = uy * ct + (p1y * cp + p2y * sp) * st;
  out[2] = uz * ct + (p1z * cp + p2z * sp) * st;
  return out;
}

const LIFE = [0.62, 0.34, 0.9]; // main, branch, crawl (seconds, before scaling)

class Builder {
  constructor(rng, cfg, char, sink, boltSeed, time) {
    this.rng = rng;
    this.cfg = cfg;
    this.char = char;
    this.sink = sink;
    this.boltSeed = boltSeed;
    this.time = time;
    this.budget = cfg.strikeBudget;
    this.impacts = [];
    this.tips = [];
    this.endTime = time;
    this.mainLength = 1;
  }

  // Emits one channel and recurses into its branches. Returns the time the
  // leader reached the far end.
  grow(sx, sy, sz, ex, ey, ez, depth, tStart, width, tier) {
    if (this.budget <= 0) return tStart;

    const cfg = this.cfg;
    const char = this.char;
    const rng = this.rng;
    const subdiv = Math.max(2, char.subdiv - depth);
    const pts = channel(rng, sx, sy, sz, ex, ey, ez, subdiv, char.rough);

    if (tier === TIER_CRAWL) {
      for (let i = 1; i < pts.length; i += 3) pts[i] = GROUND_Y;
    }

    const life = LIFE[tier] * cfg.boltLifetime * char.lifeScale;
    const speed = cfg.leaderSpeed * (tier === TIER_CRAWL ? 0.55 : 1);
    const total = polylineLength(pts);
    if (depth === 0 && tier === TIER_MAIN) this.mainLength = total;

    const nodeTimes = [tStart];
    let t = tStart;
    let travelled = 0;
    let hitGround = false;
    let nodeCount = 0;

    for (let i = 0; i + 5 < pts.length && this.budget > 0; i += 3) {
      let x0 = pts[i], y0 = pts[i + 1], z0 = pts[i + 2];
      let x1 = pts[i + 3], y1 = pts[i + 4], z1 = pts[i + 5];

      // Truncate at the ground plane instead of letting channels dive under it.
      // The tolerance matters: a main channel aimed exactly at the plane must
      // still count as an impact.
      if (tier !== TIER_CRAWL && y1 <= GROUND_Y + 1e-4 && y0 > GROUND_Y + 1e-4) {
        const f = (y0 - GROUND_Y) / Math.max(1e-6, y0 - y1);
        x1 = x0 + (x1 - x0) * f;
        z1 = z0 + (z1 - z0) * f;
        y1 = GROUND_Y;
        hitGround = true;
      }

      const segLen = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
      travelled += segLen;

      // Channels taper toward their tip; the trunk stays fat longest.
      const taper = tier === TIER_MAIN
        ? 1 - 0.45 * (travelled / Math.max(1e-6, total))
        : 1 - 0.6 * (travelled / Math.max(1e-6, total));

      this.sink.add(x0, y0, z0, x1, y1, z1, width * Math.max(0.25, taper), t, life, tier, this.boltSeed);
      this.budget--;

      t += segLen / speed;
      nodeTimes.push(t);
      nodeCount++;

      if (hitGround) {
        this.registerImpact(x1, z1, depth, tier, t, width);
        break;
      }
    }

    this.endTime = Math.max(this.endTime, t + life);

    if (!hitGround && tier !== TIER_CRAWL && nodeCount > 0) {
      // Tips that stop in mid air throw sparks.
      const li = nodeCount * 3;
      this.tips.push(pts[li], pts[li + 1], pts[li + 2], t);
    }

    if (depth >= this.cfg.maxDepth || this.budget <= 0) return t;

    // Branch off interior nodes. Probability decays with depth so the tree
    // thins out naturally instead of exploding.
    const dir = [0, 0, 0];
    const forkP = char.forkChance * (1 - depth / (this.cfg.maxDepth + 1));
    const stride = tier === TIER_CRAWL ? 2 : 1;

    for (let n = 1; n < nodeCount - 1 && this.budget > 0; n += stride) {
      if (!rng.bool(forkP)) continue;

      const i = n * 3;
      const nx = pts[i], ny = pts[i + 1], nz = pts[i + 2];
      coneDeviate(rng, pts[i + 3] - nx, pts[i + 4] - ny, pts[i + 5] - nz, char.spread, dir);

      if (tier === TIER_CRAWL) {
        dir[1] = 0;
      } else {
        dir[1] -= char.downBias;
      }
      const dl = Math.hypot(dir[0], dir[1], dir[2]) || 1e-6;

      const remaining = total * (1 - n / Math.max(1, nodeCount));
      const blen = Math.max(1.5, remaining * rng.range(0.25, 0.62));

      this.grow(
        nx, ny, nz,
        nx + (dir[0] / dl) * blen,
        ny + (dir[1] / dl) * blen,
        nz + (dir[2] / dl) * blen,
        depth + 1,
        nodeTimes[n],
        width * rng.range(0.5, 0.7),
        tier === TIER_CRAWL ? TIER_CRAWL : TIER_BRANCH,
      );
    }

    return t;
  }

  registerImpact(x, z, depth, tier, t, width) {
    const strength = tier === TIER_MAIN ? 1 : Math.max(0.15, 0.55 - depth * 0.1);
    this.impacts.push({ x, z, t, strength });

    if (tier === TIER_CRAWL || !this.rng.bool(this.char.crawlChance)) return;
    if (this.budget <= 0) return;

    // Spider lightning creeping outward across the plane from the impact.
    const arms = this.rng.int(2, 5);
    const base = this.rng.unit() * Math.PI * 2;
    for (let a = 0; a < arms && this.budget > 0; a++) {
      const ang = base + (a / arms) * Math.PI * 2 + this.rng.range(-0.5, 0.5);
      const len = this.rng.range(4, 14) * strength;
      this.grow(
        x, GROUND_Y, z,
        x + Math.cos(ang) * len, GROUND_Y, z + Math.sin(ang) * len,
        Math.max(2, this.cfg.maxDepth - 2),
        t,
        width * 0.45,
        TIER_CRAWL,
      );
    }
  }
}

// Generates one strike into `sink`. `opts` supplies the origin, the ground
// target, and the current scene time.
export function generateStrike(rng, cfg, char, sink, opts) {
  const b = new Builder(rng, cfg, char, sink, opts.boltSeed, opts.time);
  b.grow(
    opts.origin[0], opts.origin[1], opts.origin[2],
    opts.target[0], GROUND_Y, opts.target[1],
    0,
    opts.time,
    char.width * (opts.scale || 1),
    TIER_MAIN,
  );

  return {
    segments: cfg.strikeBudget - b.budget,
    impacts: b.impacts,
    tips: b.tips,
    endTime: b.endTime,
    flash: Math.min(1.4, 0.35 + (char.width / 2.7) * 0.5 * (opts.scale || 1)),
  };
}
