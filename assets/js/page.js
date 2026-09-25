// Page entry: reads the page's data attributes, then wires the stage and the details.
import { Stage } from './engine/stage.js';
import { stageSupported } from './engine/gl.js';
import { HOME_MAPPING, formFromName } from './engine/forms.js';
import { initialTier } from './engine/quality.js';
import { activeIndex, splitProgress, stageLayout } from './scroll-map.js';
import { initDetails } from './details.js';
import { TAIL_RGB } from './engine/forms.js';

const params = new URLSearchParams(location.search);
export const env = {
  reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
  fine: matchMedia('(pointer: fine)').matches,
  mobile: matchMedia('(max-width: 1023px)').matches,
  nogl: params.has('nogl'),
  nointro: params.has('nointro'),
  forceIntro: params.has('intro'),
  tier: params.get('tier')
};

const sections = () => [...document.querySelectorAll('[data-section]')];

// The hero name (or a project page's title) and the active section's heading flash white-hot.
let flashTimer = 0;
function flashName(ms) {
  if (env.reduced) return;
  const sec = sections()[Number(document.body.dataset.active || 0)];
  const targets = [document.querySelector('.name, .title'), sec && sec.querySelector('h2')].filter(Boolean);
  targets.forEach(el => el.classList.add('flash'));
  document.body.dataset.flashes = String(Number(document.body.dataset.flashes || 0) + 1);
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => document.querySelectorAll('.flash').forEach(el => el.classList.remove('flash')), ms);
}

function bootStage() {
  const host = document.querySelector('.stage');
  if (!host || env.nogl || !stageSupported()) return null;
  const tier = env.tier || initialTier({ coarse: !env.fine, width: innerWidth });
  const stage = new Stage(host.querySelector('canvas'), { tier, onFlash: flashName });
  if (env.reduced) stage.motion({ speed: 0.25, cuts: true, reduced: true });
  if (env.mobile) { stage.pinOffset(0); stage.dim(0.7); }
  stage.start();
  window.__stage = stage; // read by the browser checks
  return stage;
}

// Section under the middle of the window picks the form; the hero's scroll position moves the stage right.
function wireMapping(target, mapping) {
  const secs = sections(), hero = document.querySelector('.hero');
  let active = -1;
  const update = () => {
    const vh = innerHeight;
    const idx = activeIndex(secs.map(el => el.getBoundingClientRect().top), vh);
    if (idx !== active) {
      active = idx;
      document.body.dataset.active = String(idx);
      target.setForm(mapping[Math.min(idx, mapping.length - 1)]);
    }
    if (target.layout && !env.mobile && hero) {
      const L = stageLayout(splitProgress(hero.getBoundingClientRect().bottom, vh));
      target.layout(L.off, L.zoom);
    }
  };
  addEventListener('scroll', update, { passive: true });
  addEventListener('resize', update);
  update();
}

// Hero name: letters get wider and heavier near the cursor.
function wireNameSwell() {
  const h1 = document.querySelector('.name');
  if (!h1 || !env.fine || env.reduced) return;
  const letters = [];
  h1.querySelectorAll('.ln').forEach(ln => {
    const text = ln.textContent;
    ln.textContent = '';
    for (const ch of text) { const s = document.createElement('span'); s.textContent = ch; ln.appendChild(s); letters.push({ el: s, k: 0 }); }
  });
  const ptr = { x: -1e4, y: -1e4 };
  addEventListener('pointermove', e => { ptr.x = e.clientX; ptr.y = e.clientY; }, { passive: true });
  let last = performance.now();
  const tick = now => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (h1.getBoundingClientRect().bottom > 0) {
      for (const L of letters) {
        const b = L.el.getBoundingClientRect();
        const d = Math.hypot(b.left + b.width / 2 - ptr.x, (b.top + b.height / 2 - ptr.y) * 1.2);
        let k = Math.max(0, 1 - d / (innerWidth * 0.16));
        k = k * k * (3 - 2 * k);
        L.k += (k - L.k) * Math.min(1, dt * 9);
        L.el.style.fontVariationSettings = `'wdth' ${(119 + 6 * L.k).toFixed(1)},'wght' ${(700 + 200 * L.k).toFixed(0)}`;
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function pageMapping() {
  return document.body.dataset.page === 'home' ? HOME_MAPPING : [formFromName(document.body.dataset.form || 'galaxy')];
}

function main() {
  const stage = bootStage();
  if (stage) wireMapping(stage, pageMapping());
  wireNameSwell();
  initDetails({ fine: env.fine, reduced: env.reduced, tail: () => TAIL_RGB[stage ? stage.form : 4] });
}

main();
