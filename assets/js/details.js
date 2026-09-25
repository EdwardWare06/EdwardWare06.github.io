// The small details. Nothing here draws on the stage; the stage is the show.
// gravity: comet cursor, orbit, magnet · signal: decode · measurement: dimensions · connection: constellations
import { decode } from './lib/decode.js';
import { CONSTELLATIONS } from './constellations.js';

export function initDetails({ fine = true, reduced = false, tail = () => '255,228,190' } = {}) {
  const state = { orbit: null, mag: false, dims: 0, cards: 0 };
  window.__details = { state }; // read by the browser checks

  // signal: nav labels and contact links resolve from static on hover and on keyboard focus
  document.querySelectorAll('.nav a:not(.home), .dec').forEach(el => {
    el.setAttribute('aria-label', el.textContent.trim()); // screen readers hear the word, never the static
    const run = () => decode(el, { duration: 320, reduced });
    el.addEventListener('mouseenter', run);
    el.addEventListener('focus', run);
  });

  const cards = setupCards({ fine });
  const specs = [...document.querySelectorAll('.spec')].map(el => ({ el, on: false, p: 0 }));
  if (fine) specs.forEach(s => { s.el.addEventListener('mouseenter', () => { s.on = true; }); s.el.addEventListener('mouseleave', () => { s.on = false; }); });
  else specs.forEach(s => s.el.addEventListener('click', () => { s.on = !s.on; }));

  const cursorOn = fine && !reduced;
  if (cursorOn) document.documentElement.classList.add('cursor-on');

  // one fixed overlay canvas for dimension lines and the cursor
  const fx = document.createElement('canvas');
  fx.className = 'fx-overlay';
  fx.setAttribute('aria-hidden', 'true');
  document.body.appendChild(fx);
  const X = fx.getContext('2d');
  let VW = 0, VH = 0;
  const resize = () => { const d = Math.min(window.devicePixelRatio || 1, 2); VW = innerWidth; VH = innerHeight; fx.width = VW * d; fx.height = VH * d; X.setTransform(d, 0, 0, d, 0, 0); };
  resize(); addEventListener('resize', resize);

  // pointer, orbit and magnet (mouse only)
  const P = { x: 0, y: 0, in: false, hot: false };
  let orbitEl = null, magEl = null, oph = 0;
  const mags = cursorOn ? [...document.querySelectorAll('[data-mag]')] : [];
  const release = m => { m.classList.remove('live'); m.style.transform = ''; m.firstElementChild.style.transform = ''; };
  if (cursorOn) {
    document.addEventListener('pointermove', e => {
      P.x = e.clientX; P.y = e.clientY; P.in = true;
      P.hot = !!e.target.closest?.('a, button, .spec');
      magEl = null;
      for (const m of mags) {
        const b = m.getBoundingClientRect(), dx = e.clientX - (b.left + b.width / 2), dy = e.clientY - (b.top + b.height / 2), d = Math.hypot(dx, dy);
        if (d < 120) {
          const k = 1 - d / 120;
          m.classList.add('live');
          m.style.transform = `translate(${dx * 0.3 * k}px,${dy * 0.3 * k}px)`;
          m.firstElementChild.style.transform = `translate(${dx * 0.14 * k}px,${dy * 0.14 * k}px)`;
          if (d < Math.max(b.width * 0.6, b.height)) magEl = m;
        } else if (m.classList.contains('live')) release(m);
      }
    }, { passive: true });
    document.documentElement.addEventListener('mouseleave', () => { P.in = false; magEl = null; mags.forEach(release); });
    document.querySelectorAll('.nav a:not(.home)').forEach(a => {
      a.addEventListener('mouseenter', () => { orbitEl = a; const b = a.getBoundingClientRect(); oph = Math.atan2(P.y - (b.top + b.height / 2), P.x - (b.left + b.width / 2)); });
      a.addEventListener('mouseleave', () => { if (orbitEl === a) orbitEl = null; });
    });
  }

  const RS = { cx: 0, cy: 0, w: 22, h: 22, r: 11, f: 0 };
  let rsInit = false;
  const trail = [], mtrail = [];
  const rr = (x, y, w, h, r) => { X.beginPath(); X.moveTo(x + r, y); X.arcTo(x + w, y, x + w, y + h, r); X.arcTo(x + w, y + h, x, y + h, r); X.arcTo(x, y + h, x, y, r); X.arcTo(x, y, x + w, y, r); X.closePath(); };
  const arrow = (x, y, ang, sz) => { X.beginPath(); X.moveTo(x, y); X.lineTo(x - Math.cos(ang - 0.4) * sz, y - Math.sin(ang - 0.4) * sz); X.lineTo(x - Math.cos(ang + 0.4) * sz, y - Math.sin(ang + 0.4) * sz); X.closePath(); X.fill(); };

  function drawDimensions(dt) {
    let active = 0;
    for (const s of specs) {
      s.p = reduced ? (s.on ? 1 : 0) : Math.max(0, Math.min(1, s.p + (s.on ? dt * 3 : -dt * 4)));
      if (s.p <= 0) continue;
      active++;
      const r = s.el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > VH) continue;
      const p = 1 - Math.pow(1 - s.p, 3), al = Math.min(1, s.p * 1.5), ty = r.top - 12, rx = r.right + 12, cxm = (r.left + r.right) / 2, cym = (r.top + r.bottom) / 2;
      X.strokeStyle = `rgba(200,240,49,${0.8 * al})`; X.fillStyle = `rgba(200,240,49,${0.9 * al})`; X.lineWidth = 1;
      X.beginPath();
      X.moveTo(r.left, r.top - 3); X.lineTo(r.left, ty - 5); X.moveTo(r.right, r.top - 3); X.lineTo(r.right, ty - 5);
      X.moveTo(r.right + 3, r.top); X.lineTo(rx + 5, r.top); X.moveTo(r.right + 3, r.bottom); X.lineTo(rx + 5, r.bottom);
      X.stroke();
      const hw = (r.width / 2) * p, hh = (r.height / 2) * p;
      X.beginPath(); X.moveTo(cxm - hw, ty); X.lineTo(cxm + hw, ty); X.moveTo(rx, cym - hh); X.lineTo(rx, cym + hh); X.stroke();
      if (p > 0.97) { arrow(r.left, ty, Math.PI, 5); arrow(r.right, ty, 0, 5); arrow(rx, r.top, -Math.PI / 2, 5); arrow(rx, r.bottom, Math.PI / 2, 5); }
      X.font = '500 10px "IBM Plex Mono",monospace'; X.textAlign = 'center';
      const wl = `W ${Math.round(r.width)}`, hl = `H ${Math.round(r.height)}`, n = Math.min(1, s.p * 1.4);
      X.fillStyle = 'rgba(3,5,11,.92)'; X.fillRect(cxm - 25, ty - 7, 50, 13);
      X.fillStyle = `rgba(200,240,49,${al})`; X.fillText(wl.slice(0, Math.round(wl.length * n)), cxm, ty + 3.5);
      X.save(); X.translate(rx, cym); X.rotate(-Math.PI / 2);
      X.fillStyle = 'rgba(3,5,11,.92)'; X.fillRect(-23, -7, 46, 13);
      X.fillStyle = `rgba(200,240,49,${al})`; X.fillText(hl.slice(0, Math.round(hl.length * n)), 0, 3.5);
      X.restore(); X.textAlign = 'left';
    }
    state.dims = active;
  }

  function drawCursor(dt) {
    if (!cursorOn || !P.in) { trail.length = 0; rsInit = false; return; }
    if (!rsInit) { RS.cx = P.x; RS.cy = P.y; rsInit = true; }
    let T;
    if (orbitEl) { const b = orbitEl.getBoundingClientRect(); oph += dt * 3.4; T = { cx: b.left + b.width / 2 + Math.cos(oph) * (b.width / 2 + 10), cy: b.top + b.height / 2 + Math.sin(oph) * (b.height / 2 + 6), w: 5, h: 5, r: 2.5, f: 1 }; }
    else if (magEl) { const b = magEl.getBoundingClientRect(); T = { cx: b.left + b.width / 2, cy: b.top + b.height / 2, w: b.width + 12, h: b.height + 12, r: (b.height + 12) / 2, f: 0 }; }
    else if (P.hot) T = { cx: P.x, cy: P.y, w: 36, h: 36, r: 18, f: 0 };
    else T = { cx: P.x, cy: P.y, w: 22, h: 22, r: 11, f: 0 };
    const k = Math.min(1, dt * (orbitEl ? 9 : 14));
    for (const key in T) RS[key] += (T[key] - RS[key]) * k;
    if (orbitEl) { mtrail.unshift([RS.cx, RS.cy]); if (mtrail.length > 18) mtrail.pop(); } else mtrail.length = 0;
    trail.unshift([P.x, P.y]); if (trail.length > 12) trail.pop();
    const tc = tail();
    X.globalCompositeOperation = 'lighter';
    trail.forEach((p, i) => { const q = 1 - i / trail.length; X.fillStyle = `rgba(${tc},${0.34 * q * q})`; X.beginPath(); X.arc(p[0], p[1], 2.5 * q, 0, Math.PI * 2); X.fill(); });
    mtrail.forEach((p, i) => { const q = 1 - i / mtrail.length; X.fillStyle = `rgba(200,240,49,${0.5 * q * q})`; X.beginPath(); X.arc(p[0], p[1], 2 * q + 0.3, 0, Math.PI * 2); X.fill(); });
    X.globalCompositeOperation = 'source-over';
    rr(RS.cx - RS.w / 2, RS.cy - RS.h / 2, RS.w, RS.h, Math.max(0.5, Math.min(RS.r, RS.w / 2, RS.h / 2)));
    const col = magEl || P.hot || orbitEl ? '200,240,49' : '223,231,245';
    X.strokeStyle = `rgba(${col},${(1 - RS.f) * 0.85})`; X.lineWidth = 1; X.stroke();
    if (RS.f > 0.02) { X.fillStyle = `rgba(255,255,255,${RS.f})`; X.fill(); }
    X.fillStyle = '#fff'; X.beginPath(); X.arc(P.x, P.y, 2.1, 0, Math.PI * 2); X.fill();
    state.orbit = orbitEl ? (orbitEl.dataset.text || orbitEl.textContent) : null;
    state.mag = !!magEl;
  }

  let last = performance.now();
  const loop = now => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    X.clearRect(0, 0, VW, VH);
    X.lineCap = 'round'; X.lineJoin = 'round';
    drawDimensions(dt);
    drawCursor(dt);
    state.cards = drawCards(cards, dt, now, reduced);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

// connection: each card holds a real constellation; stars at rest, lines join on hover (mouse) or when in view (touch)
function setupCards({ fine }) {
  const io = fine ? null : new IntersectionObserver(es => es.forEach(e => { e.target._card.on = e.intersectionRatio >= 0.6; }), { threshold: [0, 0.6, 1] });
  return [...document.querySelectorAll('.ccard[data-cons]')].map(el => {
    const cv = el.querySelector('canvas'), c = cv.getContext('2d');
    const card = { el, cv, c, k: CONSTELLATIONS[el.dataset.cons], on: false, p: 0, m: { x: -999, y: -999 }, w: 0, h: 0, bg: [] };
    el._card = card;
    if (fine) {
      el.addEventListener('mouseenter', () => { card.on = true; });
      el.addEventListener('mouseleave', () => { card.on = false; card.m.x = -999; });
      el.addEventListener('pointermove', e => { const r = el.getBoundingClientRect(); card.m.x = e.clientX - r.left; card.m.y = e.clientY - r.top; });
      el.addEventListener('focus', () => { card.on = true; });
      el.addEventListener('blur', () => { card.on = false; });
    } else io.observe(el);
    new ResizeObserver(() => {
      const r = el.getBoundingClientRect(), d = Math.min(window.devicePixelRatio || 1, 2);
      if (!r.width) return;
      card.w = r.width; card.h = r.height; cv.width = r.width * d; cv.height = r.height * d; c.setTransform(d, 0, 0, d, 0, 0);
      let sd = (el.dataset.cons.charCodeAt(0) * 977 + el.dataset.cons.length * 131) % 2147483647 || 7;
      const rnd = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
      card.bg = Array.from({ length: 24 }, () => ({ x: rnd() * r.width, y: rnd() * r.height, z: 0.4 + rnd() * 0.8, ph: rnd() * 6 }));
    }).observe(el);
    return card;
  });
}

function drawCards(cards, dt, now, reduced) {
  let on = 0;
  for (const s of cards) {
    if (s.on) on++;
    if (!s.w) continue;
    const r = s.el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) continue;
    s.p = reduced ? (s.on ? 1 : 0) : Math.max(0, Math.min(1, s.p + (s.on ? dt * 1.8 : -dt * 2.5)));
    const c = s.c;
    c.clearRect(0, 0, s.w, s.h);
    c.globalCompositeOperation = 'lighter';
    for (const b of s.bg) { const tw = 0.5 + 0.5 * Math.sin(now / 1000 * 1.6 + b.ph); c.fillStyle = `rgba(200,215,240,${0.28 * tw})`; c.fillRect(b.x, b.y, b.z, b.z); }
    const pts = s.k.stars.map(st => [s.w * (0.44 + st[0] * 0.52), s.h * (0.14 + st[1] * 0.74)]);
    s.k.edges.forEach(([i, j], n) => {
      const pe = Math.max(0, Math.min(1, s.p * (s.k.edges.length * 0.55 + 1) - n * 0.55));
      if (pe <= 0) return;
      const a = pts[i], b = pts[j], near = Math.exp(-Math.hypot((a[0] + b[0]) / 2 - s.m.x, (a[1] + b[1]) / 2 - s.m.y) / 55);
      c.strokeStyle = `rgba(124,196,255,${(0.3 + 0.6 * near) * pe})`; c.lineWidth = 0.8 + 0.8 * near;
      c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(a[0] + (b[0] - a[0]) * pe, a[1] + (b[1] - a[1]) * pe); c.stroke();
    });
    pts.forEach((p, i) => {
      const st = s.k.stars[i], near = Math.exp(-Math.hypot(p[0] - s.m.x, p[1] - s.m.y) / 45), tw = 0.72 + 0.28 * Math.sin(now / 1000 * 2 + i * 1.7), rad = st[2] * (0.9 + 0.5 * near) * (1 + 0.25 * s.p);
      const g = c.createRadialGradient(p[0], p[1], 0, p[0], p[1], rad * 4);
      g.addColorStop(0, `rgba(225,238,255,${(0.3 + 0.35 * s.p + 0.3 * near) * tw})`); g.addColorStop(1, 'rgba(225,238,255,0)');
      c.fillStyle = g; c.fillRect(p[0] - rad * 4, p[1] - rad * 4, rad * 8, rad * 8);
      c.fillStyle = `rgba(255,255,255,${(0.55 + 0.45 * s.p) * tw})`; c.beginPath(); c.arc(p[0], p[1], rad * 0.6, 0, Math.PI * 2); c.fill();
    });
    c.globalCompositeOperation = 'source-over';
  }
  return on;
}
