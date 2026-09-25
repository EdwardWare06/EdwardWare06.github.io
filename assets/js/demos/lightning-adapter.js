// Stands in for the wallpaper's C# shell on the portfolio page: a click or tap in the frame drives a bolt into that spot.
// Every strike goes through one gate (at most one per 0.51 s of scene time): the storm's own strikes, its bursts,
// cursor arcs and clicks. The wallpaper allows 8 a second; here the flashes stay under the photosensitivity limit.
import { gateStrikes } from './strike-gate.js';

window.__strikes = 0;    // strikes started by a click (read by the browser checks)
window.__strikeLog = []; // scene time of every strike that got through the gate
const scene = window.LBG && window.LBG.scene;
let clicking = false;

if (scene) {
  const draw = scene.emitStrike.bind(scene);
  scene.emitStrike = gateStrikes(opts => {
    window.__strikeLog.push(opts.time);
    if (clicking) window.__strikes++;
    draw(opts);
  });
}

addEventListener('pointerdown', e => {
  if (!scene) return;
  clicking = true;
  window.LBG.strike((e.clientX / innerWidth) * 2 - 1, 1 - (e.clientY / innerHeight) * 2);
  clicking = false;
});
