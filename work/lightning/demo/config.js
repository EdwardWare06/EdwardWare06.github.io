/*
 Default configuration. The C# shell pushes a user settings object over the
 WebView2 message channel; anything it omits falls back to these values, so the
 scene always runs standalone in a plain browser too.
*/
export const DEFAULTS = {
  seed: 0,               // 0 means "pick one at random on load"
  fpsCap: 60,
  quality: 'auto',       // 'auto' | 'high' | 'low' (low halves the render scale)

  effects: {
    bloom: true,
    afterglow: true,
    aberration: true,
    scanlines: true,
    sparks: true,
    mouseReactive: true,
    reflection: true,
    scorch: true,
  },

  palette: {
    core: [0.949, 0.973, 1.0],     // #f2f8ff
    halo: [0.306, 0.658, 1.0],     // #4ea8ff
    haloDeep: [0.086, 0.259, 0.658], // #1642a8
    void: [0.016, 0.027, 0.059],   // #04070f
    grid: [0.071, 0.188, 0.333],   // #123055
  },

  camera: {
    yaw: 45,
    pitch: 30,
    distance: 260,
    halfHeight: 34,
    target: [0, 13, 0],
    driftDegrees: 2.0,
    driftSpeed: 0.035,
  },

  ground: {
    extent: 70,          // half size of the ground plane in world units
    cell: 4.0,           // grid cell size
    fogDensity: 0.019,
    gridBrightness: 1.0,
  },

  storm: {
    density: 1.0,        // global multiplier on strike frequency
    boltLifetime: 1.0,   // multiplier on how long channels linger
    maxSegments: 18000,  // ring buffer capacity (whole scene)
    strikeBudget: 2500,  // hard cap on segments a single strike may add
    maxDepth: 5,
    leaderSpeed: 620,    // world units per second of leader propagation
    spawnHeight: [34, 46],
  },

  post: {
    exposure: 1.04,
    bloomThreshold: 0.8,
    bloomStrength: 0.6,
    afterglowDecay: 0.9,
    afterglowStrength: 0.3,
    aberration: 0.9,
    scanlineStrength: 0.5,
    vignette: 0.85,
  },
};

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// Deep merge of an incoming settings patch over a base config. Arrays are
// replaced wholesale (palettes and ranges are meant to be atomic).
export function mergeConfig(base, patch) {
  const out = Array.isArray(base) ? base.slice() : { ...base };
  if (!isPlainObject(patch)) return out;
  for (const key of Object.keys(patch)) {
    const pv = patch[key];
    if (pv === undefined || pv === null) continue;
    if (isPlainObject(pv) && isPlainObject(out[key])) {
      out[key] = mergeConfig(out[key], pv);
    } else {
      out[key] = Array.isArray(pv) ? pv.slice() : pv;
    }
  }
  return out;
}

export function cloneDefaults() {
  return mergeConfig(DEFAULTS, {});
}
