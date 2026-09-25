// Quality tiers. Particle state textures are cols x rows.
export const TIERS = {
  high: { cols: 512, rows: 512, dpr: 1.5 },
  mid: { cols: 512, rows: 512, dpr: 1.0 },
  low: { cols: 512, rows: 256, dpr: 1.0 },
  mobile: { cols: 256, rows: 256, dpr: 1.0 }
};
// Slow frames lower the resolution first, then halve the particles.
export const DOWNGRADE = { high: 'mid', mid: 'low', low: 'low', mobile: 'mobile' };

export function initialTier({ coarse = false, width = 1920 } = {}) {
  return coarse || width < 1024 ? 'mobile' : 'high';
}
export function nextTier(tier, avgFrameMs, budgetMs = 20) {
  return avgFrameMs > budgetMs ? DOWNGRADE[tier] : tier;
}
export function particleCount(tier) {
  const t = TIERS[tier];
  return t.cols * t.rows;
}
export class FrameMeter {
  constructor(size = 90) { this.size = size; this.samples = []; }
  add(ms) { this.samples.push(ms); if (this.samples.length > this.size) this.samples.shift(); }
  get avg() { return this.samples.length ? this.samples.reduce((a, b) => a + b, 0) / this.samples.length : 0; }
  reset() { this.samples.length = 0; }
}
