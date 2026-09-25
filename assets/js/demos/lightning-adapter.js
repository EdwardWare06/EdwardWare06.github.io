// Stands in for the wallpaper's C# shell on the portfolio page: a click or tap in the frame drives a bolt into that spot.
// The wallpaper allows 8 strikes a second; here it is 2, so the flashes stay under the photosensitivity limit.
const MIN_GAP_MS = 500;
let last = -Infinity;
window.__strikes = 0; // read by the browser checks

addEventListener('pointerdown', e => {
  const now = performance.now();
  if (now - last < MIN_GAP_MS || !window.LBG || !window.LBG.scene) return;
  last = now;
  window.__strikes++;
  window.LBG.strike((e.clientX / innerWidth) * 2 - 1, 1 - (e.clientY / innerHeight) * 2);
});
