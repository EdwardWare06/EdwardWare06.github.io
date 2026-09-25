// 404: the Singularity breathes at the centre; RETURN TO ORBIT detonates it into the Galaxy, then Home loads.
import { FORM } from './engine/forms.js';
import { decode } from './lib/decode.js';

export function initLost(stage, { flash = () => {}, reduced = false } = {}) {
  [...document.querySelectorAll('[data-decode]')].forEach((el, i) => {
    setTimeout(() => decode(el, { duration: 600, reduced }), reduced ? 0 : 150 + i * 140);
  });
  const btn = document.querySelector('.orbit'), white = document.querySelector('.lost-flash');
  if (!stage || !btn) return null;

  let state = 'sing';
  const t0 = performance.now();
  const breathe = now => {
    if (state !== 'sing') return;
    if (!reduced) { const b = Math.max(0, Math.sin((now - t0) / 1000 * 2.2)); stage.sing(0.035 * (1 + 0.35 * b * b)); }
    requestAnimationFrame(breathe);
  };
  requestAnimationFrame(breathe);

  btn.addEventListener('click', e => {
    if (reduced || state !== 'sing') return; // reduce motion: the link simply goes home
    e.preventDefault();
    state = 'bang';
    white.classList.add('go');
    stage.sing(0.035);
    stage.kick(6);
    stage.setForm(FORM.GALAXY);
    flash(320);
    setTimeout(() => { location.href = btn.getAttribute('href'); }, 1200);
  });
  return { get state() { return state; } };
}
