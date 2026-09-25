// Contrast audit for the browser checks (spec §8): each visible text element against what can sit behind it.
// Where a text's backgrounds are not opaque, they are laid over the brightest stage pixels seen while sampling.
const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lum = c => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const rgba = s => { const m = (s.match(/[\d.]+/g) || []).map(Number); return [m[0] || 0, m[1] || 0, m[2] || 0, m.length > 3 ? m[3] : 1]; };
const over = (top, under) => [0, 1, 2].map(i => top[i] * top[3] + under[i] * (1 - top[3]));
const SKY = [2, 3, 8];
const frame = () => new Promise(r => requestAnimationFrame(r));
const sleep = ms => new Promise(r => setTimeout(r, ms));

function textElements() {
  const seen = new Set(), out = [];
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const el = n.parentElement;
    if (!el || seen.has(el) || !n.textContent.trim()) continue;
    seen.add(el);
    if (el.closest('[aria-hidden="true"], .skip-link, .intro, script, style')) continue;
    if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || r.bottom <= 0 || r.top >= innerHeight) continue;
    out.push(el);
  }
  return out;
}

// Background colours from the outermost ancestor down to the element. body and html sit behind the
// fixed stage, so they do not count. `opaque` is true when one of the layers hides the stage.
function layers(el) {
  const list = [];
  for (let e = el; e && e !== document.body; e = e.parentElement) {
    const c = rgba(getComputedStyle(e).backgroundColor);
    if (c[3] > 0) list.unshift(c);
    if (c[3] >= 1) return { list, opaque: true };
  }
  return { list, opaque: false };
}

// Brightest stage colour behind each rectangle over `ms` of frames (the 90th-percentile pixel per frame).
async function stageBehind(rects, ms) {
  const best = rects.map(() => SKY);
  const src = document.querySelector('.stage canvas');
  if (!src || !window.__stage || getComputedStyle(src).display === 'none') return best;
  const k = 4, w = Math.ceil(innerWidth / k), h = Math.ceil(innerHeight / k);
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  const t0 = performance.now();
  while (performance.now() - t0 < ms) {
    await frame(); // the stage draws earlier in the same frame, so its buffer is still readable here
    cx.drawImage(src, 0, 0, w, h);
    const img = cx.getImageData(0, 0, w, h).data;
    rects.forEach((r, i) => {
      const x0 = Math.max(0, Math.floor(r.left / k)), x1 = Math.min(w, Math.ceil(r.right / k));
      const y0 = Math.max(0, Math.floor(r.top / k)), y1 = Math.min(h, Math.ceil(r.bottom / k));
      const px = [];
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const o = (y * w + x) * 4; px.push([img[o], img[o + 1], img[o + 2]]); }
      if (!px.length) return;
      px.sort((a, b) => lum(a) - lum(b));
      const p = px[Math.floor(px.length * 0.9)];
      if (lum(p) > lum(best[i])) best[i] = p;
    });
    await sleep(120);
  }
  return best;
}

export async function audit({ ms = 2000 } = {}) {
  const els = textElements();
  const stage = await stageBehind(els.map(el => el.getBoundingClientRect()), ms);
  const fails = [];
  els.forEach((el, i) => {
    const cs = getComputedStyle(el), { list, opaque } = layers(el);
    let bg = opaque ? SKY : stage[i];
    for (const c of list) bg = over(c, bg);
    const fg = over(rgba(cs.color), bg);
    const size = parseFloat(cs.fontSize), bold = Number(cs.fontWeight) >= 700;
    const need = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
    const r = ratio(fg, bg);
    if (r < need) fails.push(`${el.textContent.trim().slice(0, 40)} · ${r.toFixed(2)} < ${need}`);
  });
  return fails;
}

export async function auditPage({ ms = 2000 } = {}) {
  const fails = new Set();
  for (const sec of document.querySelectorAll('[data-section]')) {
    sec.scrollIntoView({ block: 'start' });
    await sleep(600);
    for (const f of await audit({ ms })) fails.add(`${sec.dataset.section}: ${f}`);
  }
  scrollTo(0, 0);
  return [...fails];
}
