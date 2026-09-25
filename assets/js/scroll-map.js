import { smooth } from './lib/math.js';

// Index of the last section whose top has passed `threshold` of the window height.
export function activeIndex(tops, viewportH, threshold = 0.5) {
  let a = 0;
  for (let i = 0; i < tops.length; i++) if (tops[i] < viewportH * threshold) a = i;
  return a;
}
// 0 while the hero fills the window, 1 once it has scrolled away.
export function splitProgress(heroBottom, viewportH) {
  return smooth(1 - heroBottom / viewportH);
}
// Stage offset (NDC x) and zoom-out between the hero and the split.
export function stageLayout(progress, { hero = 0.3, split = 0.44, zoomSplit = 1.28 } = {}) {
  return { off: hero + (split - hero) * progress, zoom: 1 + (zoomSplit - 1) * progress };
}
