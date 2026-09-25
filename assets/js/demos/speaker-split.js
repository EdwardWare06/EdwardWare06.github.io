// Voice Recorder demo: a made-up team meeting. The waveform splits by speaker as it plays, and each line gets a name.
// No microphone and no real audio.
import { decode } from '../lib/decode.js';

const SPEAKERS = { A: { name: 'ALEX', rgb: '124,196,255' }, B: { name: 'SAM', rgb: '200,240,49' }, C: { name: 'JORDAN', rgb: '255,170,90' } };
export const DURATION = 10;
export const SCRIPT = [
  { who: 'A', t0: 0, t1: 2.6, text: "Okay, let's start. My name is Alex, I'll run this one.", how: 'NAME LINK · "My name is Alex"' },
  { who: 'B', t0: 2.6, t1: 5, text: 'Sam here. The export finished last night.', how: 'MATCH 0.91' },
  { who: 'C', t0: 5, t1: 7.6, text: "Good. I'll check the numbers after this.", how: 'MATCH 0.87' },
  { who: 'A', t0: 7.6, t1: 10, text: 'Then we can close out the week.', how: 'MATCH 0.94' }
];

export function speakerAt(t) {
  const seg = SCRIPT.find(s => t >= s.t0 && t < s.t1);
  return seg ? seg.who : null;
}

function init(root) {
  const cv = root.querySelector('.demo-wave'), ctx = cv.getContext('2d');
  const btn = root.querySelector('.demo-play'), list = root.querySelector('.demo-lines');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const BARS = 120;
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const amp = Array.from({ length: BARS }, (_, i) => {
    const tb = (i + 0.5) / BARS * DURATION;
    const pause = SCRIPT.some(s => s.t0 > 0 && Math.abs(tb - s.t0) < 0.12) ? 0.15 : 1; // a short breath between speakers
    return (0.25 + 0.75 * Math.abs(Math.sin(i * 0.37) * 0.6 + Math.sin(i * 0.11 + 1.3) * 0.4) * (0.6 + 0.4 * rnd())) * pause;
  });
  let W = 0, H = 0, lastT = 0;

  function draw(t) {
    lastT = t;
    ctx.clearRect(0, 0, W, H);
    const bw = W / BARS;
    for (let i = 0; i < BARS; i++) {
      const tb = (i + 0.5) / BARS * DURATION, who = speakerAt(tb), h = amp[i] * H * 0.44;
      ctx.fillStyle = tb <= t && who ? `rgba(${SPEAKERS[who].rgb},0.95)` : 'rgba(140,170,230,0.28)';
      ctx.fillRect(i * bw + bw * 0.2, H / 2 - h, bw * 0.6, h * 2);
    }
    if (t > 0 && t < DURATION) { ctx.fillStyle = '#fff'; ctx.fillRect(t / DURATION * W, 4, 1, H - 8); }
  }
  function resize() {
    const r = cv.getBoundingClientRect(), d = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height; cv.width = W * d; cv.height = H * d; ctx.setTransform(d, 0, 0, d, 0, 0);
    draw(lastT);
  }
  function addLine(seg) {
    const li = document.createElement('li');
    li.innerHTML = '<span class="who">SPEAKER ?</span><span><span class="txt"></span><span class="meta"></span></span>';
    const who = li.querySelector('.who'), meta = li.querySelector('.meta');
    who.style.color = `rgb(${SPEAKERS[seg.who].rgb})`;
    li.querySelector('.txt').textContent = seg.text;
    list.appendChild(li);
    setTimeout(() => { decode(who, { text: SPEAKERS[seg.who].name, duration: 420, reduced }); meta.textContent = seg.how; }, reduced ? 0 : 700);
  }

  let playing = false;
  btn.addEventListener('click', () => {
    if (playing) return;
    playing = true; btn.disabled = true; list.innerHTML = '';
    const done = () => { playing = false; btn.disabled = false; btn.firstElementChild.textContent = 'PLAY AGAIN ▸'; };
    if (reduced) { SCRIPT.forEach(addLine); draw(DURATION); done(); return; }
    const t0 = performance.now();
    let shown = 0;
    const tick = now => {
      const t = (now - t0) / 1000;
      while (shown < SCRIPT.length && t >= SCRIPT[shown].t0) addLine(SCRIPT[shown++]);
      draw(Math.min(t, DURATION));
      if (t < DURATION) requestAnimationFrame(tick); else done();
    };
    requestAnimationFrame(tick);
  });
  new ResizeObserver(resize).observe(cv);
}

const root = typeof document !== 'undefined' ? document.getElementById('speaker-demo') : null;
if (root) init(root);
