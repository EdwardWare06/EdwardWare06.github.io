// Page entry: reads the page's data attributes, then wires the stage and the details.
import { Stage } from './engine/stage.js';
import { stageSupported } from './engine/gl.js';
import { HOME_MAPPING, formFromName } from './engine/forms.js';
import { initialTier, nextTier } from './engine/quality.js';
import { activeIndex, splitProgress, stageLayout } from './scroll-map.js';
import { initDetails } from './details.js';
import { initRail } from './rail.js';
import { runIntro, shouldPlayIntro, sessionStore, markIntroSeen } from './intro.js';
import { TAIL_RGB } from './engine/forms.js';

const params = new URLSearchParams(location.search);
const narrow = matchMedia('(max-width: 1023px)');
export const env = {
  reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
  fine: matchMedia('(pointer: fine)').matches,
  mobile: narrow.matches, // kept current when the window crosses the breakpoint
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

// Below 1024 px the stage sits centred and dimmed behind full-width panels.
function fitStage(stage) {
  stage.pinOffset(env.mobile ? 0 : null);
  stage.dim(env.mobile ? 0.7 : 1);
}

function bootStage() {
  const host = document.querySelector('.stage');
  if (!host || env.nogl || !stageSupported()) return null;
  const tier = env.tier || initialTier({ coarse: !env.fine, width: innerWidth });
  const stage = new Stage(host.querySelector('canvas'), { tier, onFlash: flashName });
  if (env.reduced) stage.motion({ speed: 0.25, cuts: true, reduced: true });
  fitStage(stage);
  stage.start();
  window.__stage = stage; // read by the browser checks
  return stage;
}

// Section under the middle of the window picks the form; the hero's scroll position moves the stage right.
function wireMapping(target, mapping) {
  const secs = sections(), hero = document.querySelector('.hero');
  let active = -1, settling = true, want = null, since = 0, pending = 0;
  // Until the page has loaded (and the browser has jumped to any #anchor), forms appear already formed.
  const settled = () => requestAnimationFrame(() => { settling = false; });
  if (document.readyState === 'complete') settled(); else addEventListener('load', settled, { once: true });
  const commit = () => { clearTimeout(pending); if (want !== null) { target.setForm(want); want = null; } };
  const update = () => {
    const vh = innerHeight;
    const idx = activeIndex(secs.map(el => el.getBoundingClientRect().top), vh);
    // While the intro runs it owns the stage; the mapping catches up when the intro ends.
    if (idx !== active && !document.documentElement.classList.contains('intro-lock')) {
      active = idx;
      document.body.dataset.active = String(idx);
      const f = mapping[Math.min(idx, mapping.length - 1)];
      if (settling && target.snap) { want = null; target.snap(f); } // no morph, no flash on arrival
      else { want = f; since = performance.now(); }
    }
    // A fast scroll passes sections without starting their forms: a form starts once scrolling
    // pauses, or once its section has held the middle of the window for a moment.
    if (want !== null) {
      clearTimeout(pending);
      if (performance.now() - since >= 450) commit(); else pending = setTimeout(commit, 150);
    }
    if (target.layout && !env.mobile && hero) {
      const L = stageLayout(splitProgress(hero.getBoundingClientRect().bottom, vh));
      target.layout(L.off, L.zoom);
    }
  };
  addEventListener('scroll', update, { passive: true });
  addEventListener('resize', update);
  update();
  return update;
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

// During the first seconds, step the quality down if frames are slow (resolution first, then particles).
function watchQuality(stage) {
  if (env.tier || stage.tier === 'mobile') return; // a forced tier stays put
  let tries = 0;
  const check = () => {
    const next = nextTier(stage.tier, stage.frameMs());
    if (next === stage.tier) return;
    stage.setTier(next);
    stage.meter.reset();
    if (++tries < 3) setTimeout(check, 2500);
  };
  // measure only once the stage is drawing: before that, frames are cheap and say nothing
  const start = () => (stage.ready ? setTimeout(() => { stage.meter.reset(); setTimeout(check, 2000); }, 1000) : requestAnimationFrame(start));
  start();
}

// No WebGL2: crossfade pre-rendered stills of each form.
function bootFallback() {
  const host = document.querySelector('.stage');
  if (!host) return null;
  host.classList.add('no-gl');
  const imgs = [0, 1].map(() => { const img = document.createElement('img'); img.alt = ''; img.decoding = 'async'; host.appendChild(img); return img; });
  let front = 0, form = -1;
  return {
    get form() { return form; },
    setForm(f) {
      if (f === form) return;
      form = f;
      const back = imgs[1 - front];
      back.onload = () => { back.style.opacity = '1'; imgs[front].style.opacity = '0'; front = 1 - front; };
      back.src = `/assets/img/fallback/form-${f}.webp`;
    }
  };
}

// Home only: the intro on the first visit per session, and the footer's "Replay intro".
function wireIntro(stage, remap) {
  const replay = document.querySelector('.replay-intro');
  const play = !!stage && document.body.dataset.page === 'home' &&
    shouldPlayIntro({ storage: sessionStore(), reduced: env.reduced, hash: location.hash, forced: env.forceIntro, disabled: env.nointro });
  // The intro belongs to the first page view of a session; any other first view uses it up.
  if (!play) markIntroSeen(sessionStore());
  if (!stage || env.reduced) { if (replay) replay.hidden = true; return; } // reduce motion: never an intro
  if (document.body.dataset.page !== 'home') return;
  if (play) runIntro(stage, { flash: flashName }).finished.then(remap);
  replay?.addEventListener('click', () => runIntro(stage, { flash: flashName }).finished.then(remap));
}

function main() {
  const stage = bootStage();
  const target = stage || bootFallback();
  const remap = target ? wireMapping(target, pageMapping()) : () => {};
  if (stage) watchQuality(stage);
  narrow.addEventListener('change', e => { env.mobile = e.matches; if (stage) fitStage(stage); remap(); });
  wireNameSwell();
  initDetails({ fine: env.fine, reduced: env.reduced, tail: () => TAIL_RGB[target && target.form >= 0 ? target.form : 4] });
  initRail({ enabled: env.fine }); // CSS hides it below 1024 px
  wireIntro(stage, remap);
}

main();
