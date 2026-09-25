// Timeline: the path as a constellation over the dimmed Galaxy. The list below it is the source of truth.
// Past entries are solid stars on solid lines; planned entries are hollow stars on dashed lines.

export function starLayout(n, w, h, pad = 0.08) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const f = n > 1 ? i / (n - 1) : 0.5;
    out.push([w * (pad + (1 - 2 * pad) * f), h * (0.74 - 0.5 * f + 0.08 * Math.sin(i * 1.9))]);
  }
  return out;
}

export function yearLabels(whens) {
  const out = [];
  let prev = null;
  whens.forEach((w, i) => {
    const y = (w.match(/\d{4}/) || [null])[0];
    if (y && y !== prev) out.push([i, y]);
    if (y) prev = y;
  });
  return out;
}

export function initTimeline({ reduced = false } = {}) {
  const sky = document.querySelector('.tl-sky'), list = document.querySelector('.tl-list');
  if (!sky || !list) return null;
  const items = [...list.querySelectorAll('li')];
  const entries = items.map(li => ({
    when: li.querySelector('.tl-when').textContent,
    what: li.querySelector('.tl-what').textContent,
    planned: li.dataset.state === 'planned'
  }));
  const labels = yearLabels(entries.map(e => e.when));
  const cv = sky.querySelector('canvas'), ctx = cv.getContext('2d'), card = sky.querySelector('.tl-card');
  let W = 0, H = 0, pts = [], hot = -1;

  const resize = () => {
    const r = sky.getBoundingClientRect(), d = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height; cv.width = W * d; cv.height = H * d; ctx.setTransform(d, 0, 0, d, 0, 0);
    pts = starLayout(entries.length, W, H);
  };
  new ResizeObserver(resize).observe(sky);
  resize();

  const show = i => {
    hot = i;
    items.forEach((li, k) => li.classList.toggle('on', k === i));
    if (i < 0) { card.hidden = true; return; }
    card.querySelector('.tl-card-when').textContent = entries[i].when;
    card.querySelector('.tl-card-what').textContent = entries[i].what;
    card.hidden = false;
    const [x, y] = pts[i], cw = card.offsetWidth;
    card.style.left = `${Math.min(W - cw, Math.max(0, x - cw / 2))}px`;
    card.style.top = `${y + 22}px`;
  };

  // mouse: the nearest star within reach shows its entry
  sky.addEventListener('pointermove', e => {
    const r = sky.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    let best = -1, bd = 26;
    pts.forEach(([px, py], i) => { const d = Math.hypot(px - x, py - y); if (d < bd) { bd = d; best = i; } });
    if (best !== hot) show(best);
  });
  sky.addEventListener('pointerleave', () => show(-1));
  // keyboard and list: each entry is focusable and lights its star
  items.forEach((li, i) => {
    li.tabIndex = 0;
    li.addEventListener('focus', () => show(i));
    li.addEventListener('blur', () => show(-1));
    li.addEventListener('mouseenter', () => show(i));
    li.addEventListener('mouseleave', () => show(-1));
  });

  const draw = now => {
    ctx.clearRect(0, 0, W, H);
    for (let i = 1; i < pts.length; i++) {
      const planned = entries[i].planned;
      ctx.setLineDash(planned ? [5, 6] : []);
      ctx.strokeStyle = `rgba(124,196,255,${planned ? 0.45 : 0.6})`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pts[i - 1][0], pts[i - 1][1]); ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke();
    }
    ctx.setLineDash([]);
    pts.forEach(([x, y], i) => {
      const on = i === hot, tw = reduced ? 1 : 0.85 + 0.15 * Math.sin(now / 900 + i * 1.3), r = (on ? 5.5 : 3.6) * tw;
      if (entries[i].planned) {
        ctx.strokeStyle = on ? '#c8f031' : 'rgba(234,242,255,.85)';
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
      } else {
        const g = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
        g.addColorStop(0, on ? 'rgba(200,240,49,.55)' : 'rgba(225,238,255,.45)');
        g.addColorStop(1, 'rgba(225,238,255,0)');
        ctx.fillStyle = g; ctx.fillRect(x - r * 4, y - r * 4, r * 8, r * 8);
        ctx.fillStyle = on ? '#c8f031' : '#fff';
        ctx.beginPath(); ctx.arc(x, y, r * 0.7, 0, Math.PI * 2); ctx.fill();
      }
    });
    ctx.font = '500 11px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(159,180,214,.85)';
    for (const [i, y] of labels) ctx.fillText(y, pts[i][0], pts[i][1] - 16);
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);

  window.__timeline = { show, get hot() { return hot; }, get pts() { return pts; } }; // read by the browser checks
  return { show };
}
