export const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
export const smooth = x => { const t = clamp01(x); return t * t * (3 - 2 * t); };
export const smoothRange = (a, b, x) => smooth((x - a) / (b - a));
export const lerp = (a, b, t) => a + (b - a) * t;
export function lerpAngle(a, b, t) {
  const d = (((b - a) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
  return a + d * t;
}
