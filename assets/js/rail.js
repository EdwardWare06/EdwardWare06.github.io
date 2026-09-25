// Trajectory rail: replaces the native scrollbar on desktop. A tick per section and a comet for "you are here".
import { clamp01 } from './lib/math.js';
import { activeIndex } from './scroll-map.js';

export function tickFractions(tops, docHeight, viewportH) {
  const max = Math.max(1, docHeight - viewportH);
  return tops.map(t => clamp01(t / max));
}

export function initRail({ enabled }) {
  const secs = [...document.querySelectorAll('[data-section]')];
  if (!enabled || secs.length < 2) return null;
  document.documentElement.classList.add('has-rail');
  const rail = document.createElement('nav');
  rail.className = 'rail';
  rail.setAttribute('aria-label', 'Page sections');
  rail.innerHTML = '<div class="rail-line"></div><div class="rail-comet" aria-hidden="true"></div>';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ticks = secs.map((el, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'rail-tick';
    b.setAttribute('aria-label', `Go to ${el.dataset.section}`);
    b.innerHTML = `<span class="rail-label">FIG. ${String(i).padStart(2, '0')} · ${el.dataset.section}</span>`;
    b.addEventListener('click', () => el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }));
    rail.appendChild(b);
    return b;
  });
  document.body.appendChild(rail);
  const comet = rail.querySelector('.rail-comet');

  const layout = () => {
    const tops = secs.map(el => el.getBoundingClientRect().top + scrollY);
    tickFractions(tops, document.documentElement.scrollHeight, innerHeight).forEach((f, i) => { ticks[i].style.top = `${f * 100}%`; });
  };
  let target = 0, pos = 0, last = performance.now();
  const onScroll = () => {
    target = clamp01(scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight));
    const idx = activeIndex(secs.map(el => el.getBoundingClientRect().top), innerHeight);
    ticks.forEach((b, i) => b.classList.toggle('on', i === idx));
  };
  const tick = now => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const prev = pos;
    pos += (target - pos) * Math.min(1, dt * 10);
    comet.style.top = `${pos * 100}%`;
    comet.style.setProperty('--v', Math.min(1, Math.abs(target - pos) * 40).toFixed(3));
    rail.classList.toggle('up', pos < prev);
    requestAnimationFrame(tick);
  };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', () => { layout(); onScroll(); });
  layout(); onScroll();
  requestAnimationFrame(tick);
  return { layout };
}
