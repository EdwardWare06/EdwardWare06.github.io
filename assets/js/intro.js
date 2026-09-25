// Big Bang intro: plays once per session on Home, then hands off to the live Galaxy hero.
import { FORM } from './engine/forms.js';
import { decode } from './lib/decode.js';

export const INTRO_KEY = 'ew-intro-seen';
const SCROLL_KEYS = new Set([' ', 'PageDown', 'PageUp', 'ArrowDown', 'ArrowUp', 'Home', 'End']);

export function sessionStore() {
  try { return window.sessionStorage; } catch { return null; }
}

export function shouldPlayIntro({ storage, reduced = false, hash = '', forced = false, disabled = false }) {
  if (disabled || reduced) return false;
  if (forced) return true;
  if (hash && hash !== '#') return false;
  try { return storage.getItem(INTRO_KEY) !== '1'; } catch { return true; }
}

export function markIntroSeen(storage) {
  try { storage.setItem(INTRO_KEY, '1'); } catch { /* storage blocked: the intro can play again next time */ }
}

export function runIntro(stage, { flash = () => {} } = {}) {
  const root = document.documentElement, body = document.body;
  const el = document.createElement('div');
  el.className = 'intro';
  el.innerHTML = '<div class="intro-flash"></div><p class="label intro-count" aria-hidden="true"></p><button type="button" class="label intro-skip">SKIP INTRO ↵</button>';
  body.appendChild(el);
  const whiteout = el.querySelector('.intro-flash'), count = el.querySelector('.intro-count');

  scrollTo(0, 0);
  root.classList.add('intro-lock');
  body.classList.add('ih-name', 'ih-rest');
  stage.sky(0, true); stage.sing(0.035, true); stage.snap(FORM.SINGULARITY);

  let done = false, t0 = null, lastN = 0;
  const fired = new Set();
  const once = (k, fn) => { if (!fired.has(k)) { fired.add(k); fn(); } };
  let resolveFinished;
  const finished = new Promise(r => { resolveFinished = r; });

  // While the intro runs, wheel, touch and scroll keys do nothing. Only the button, Esc or Enter skip it.
  const block = e => {
    if (e.type === 'keydown') {
      if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); finish(true); return; }
      if (!SCROLL_KEYS.has(e.key)) return;
    }
    e.preventDefault();
  };
  addEventListener('wheel', block, { passive: false });
  addEventListener('touchmove', block, { passive: false });
  addEventListener('keydown', block);

  function finish(skipped) {
    if (done) return;
    done = true;
    if (skipped) { stage.sing(0.035); stage.setForm(FORM.GALAXY); stage.sky(1, true); } else stage.sky(1);
    body.classList.remove('ih-name', 'ih-rest');
    root.classList.remove('intro-lock');
    removeEventListener('wheel', block);
    removeEventListener('touchmove', block);
    removeEventListener('keydown', block);
    el.classList.add('out');
    setTimeout(() => el.remove(), 600);
    markIntroSeen(sessionStore());
    resolveFinished();
  }
  el.querySelector('.intro-skip').addEventListener('click', () => finish(true));

  const frame = () => {
    if (done) return;
    // The timeline starts once the warm-up has run. The warm-up is one long task, so the frame timestamp
    // is stale right after it; the clock reads performance.now() instead.
    if (!stage.ready) { requestAnimationFrame(frame); return; }
    if (t0 === null) t0 = performance.now();
    const t = (performance.now() - t0) / 1000;
    if (t < 1.95) {
      const n = 3 - Math.floor(t / 0.63);
      if (n > 0 && n !== lastN) { lastN = n; decode(count, { text: `T − ${n}`, duration: 260 }); }
      if (n <= 0 && count.textContent) count.textContent = '';
      const b = Math.max(0, Math.sin(t * 10));
      stage.sing(0.035 * (1 + 0.35 * b) * (t > 1.5 ? Math.max(0.2, 1 - (t - 1.5) * 2.2) : 1));
    }
    if (t >= 1.95) once('boom', () => { count.textContent = ''; stage.kick(6); stage.setForm(FORM.GALAXY); stage.sky(1); whiteout.classList.add('go'); });
    if (t >= 3.1) once('name', () => { body.classList.remove('ih-name'); flash(320); });
    if (t >= 3.6) once('rest', () => body.classList.remove('ih-rest'));
    if (t >= 5.4) { finish(false); return; }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  return { finished, skip: () => finish(true) };
}
