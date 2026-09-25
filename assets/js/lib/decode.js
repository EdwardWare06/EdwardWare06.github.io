// "Signal" text: characters resolve out of static, left to right.
export const GLYPHS = '▓▒░<>/\\|=+*#01';

export function scramble(text, progress, rand = Math.random) {
  const p = progress < 0 ? 0 : progress > 1 ? 1 : progress;
  const n = Math.floor(p * text.length);
  let out = text.slice(0, n);
  for (const ch of text.slice(n)) out += ch === ' ' ? ' ' : GLYPHS[Math.floor(rand() * GLYPHS.length) % GLYPHS.length];
  return out;
}

const running = new WeakMap();

export function decode(el, { duration = 320, text, reduced = false } = {}) {
  const final = text ?? el.dataset.text ?? el.textContent;
  el.dataset.text = final;
  if (reduced || duration <= 0) { el.textContent = final; return Promise.resolve(); }
  const token = {};
  running.set(el, token);
  const t0 = performance.now();
  return new Promise(resolve => {
    const tick = () => {
      if (running.get(el) !== token) return resolve();
      const p = Math.min(1, (performance.now() - t0) / duration);
      el.textContent = scramble(final, p);
      if (p < 1) requestAnimationFrame(tick); else { el.textContent = final; resolve(); }
    };
    tick();
  });
}
