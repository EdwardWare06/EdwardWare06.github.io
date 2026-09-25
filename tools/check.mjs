// Browser checks over the Chrome DevTools protocol, on the real GPU. Dev tool, never linked from the site.
// usage (from WSL): npm run e2e -- tests/e2e/<name>.json [more.json ...]
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LOCAL = /^(http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/|data:|blob:|about:)/;
const KEYCODES = { Tab: 9, Enter: 13, Escape: 27, ' ': 32, PageUp: 33, PageDown: 34, End: 35, Home: 36, ArrowUp: 38, ArrowDown: 40 };

async function runSpec(file) {
  const spec = JSON.parse(readFileSync(file, 'utf8'));
  const [W, H] = spec.viewport || [1300, 1000];
  const port = 9400 + Math.floor(Math.random() * 500);
  const profile = `${process.env.TEMP || 'C:\\Windows\\Temp'}\\ew-e2e-${port}`;
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    `--window-size=${W},${H}`, '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', 'about:blank'
  ], { stdio: 'ignore' });

  let wsUrl;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      wsUrl = list.find(t => t.type === 'page')?.webSocketDebuggerUrl;
    } catch {}
    if (!wsUrl) await sleep(200);
  }
  // Chrome writes a throwaway profile per run; remove it once Chrome has exited.
  const quit = async () => {
    if (chrome.exitCode === null) { const exited = new Promise(r => chrome.once('exit', r)); chrome.kill(); await exited; }
    for (let i = 0; i < 10; i++) { try { rmSync(profile, { recursive: true, force: true }); return; } catch { await sleep(300); } }
  };
  if (!wsUrl) { await quit(); console.log('FAIL  no DevTools target'); return 1; }

  const sock = new WebSocket(wsUrl);
  await new Promise(r => (sock.onopen = r));
  let id = 0;
  const pending = new Map(), errors = [], requests = [];
  sock.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value ?? a.description).join(' '));
    if (m.method === 'Network.requestWillBeSent') requests.push(m.params.request.url);
  };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); sock.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expression, timeout = 60000) => {
    const r = await Promise.race([
      send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }),
      sleep(timeout).then(() => ({ result: { exceptionDetails: { text: `timed out after ${timeout} ms` } } }))
    ]);
    if (r.result?.exceptionDetails) return { __error: r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text };
    return r.result?.result?.value;
  };
  const centerOf = async sel => evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;const b=e.getBoundingClientRect();return [b.left+b.width/2,b.top+b.height/2]})()`);

  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: spec.dpr || 1, mobile: !!spec.mobile });
  if (spec.touch) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  if (spec.media) await send('Emulation.setEmulatedMedia', { features: Object.entries(spec.media).map(([name, value]) => ({ name, value })) });
  await send('Page.navigate', { url: spec.url });
  await sleep(spec.settle ?? 1500);

  mkdirSync('tests/e2e/out', { recursive: true });
  let failed = 0;
  for (const [i, st] of (spec.steps || []).entries()) {
    const label = st.name || `step ${i + 1}`;
    if (st.viewport) await send('Emulation.setDeviceMetricsOverride', { width: st.viewport[0], height: st.viewport[1], deviceScaleFactor: 1, mobile: false });
    if (st.scrollTo) await evaluate(`document.querySelector(${JSON.stringify(st.scrollTo)}).scrollIntoView({block:'start'})`);
    if (st.hover) {
      const c = await centerOf(st.hover);
      if (!c) { failed++; console.log(`FAIL  ${label}: no element ${st.hover}`); continue; }
      const [dx, dy] = st.offset || [0, 0];
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c[0] + dx, y: c[1] + dy });
    }
    if (st.mouse) await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: st.mouse[0], y: st.mouse[1] });
    if (st.clickSel) {
      const c = await centerOf(st.clickSel);
      if (!c) { failed++; console.log(`FAIL  ${label}: no element ${st.clickSel}`); continue; }
      for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: c[0], y: c[1], button: 'left', clickCount: 1 });
    }
    if (st.wheel) await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: st.wheel[0], y: st.wheel[1], deltaX: 0, deltaY: st.wheel[2] });
    if (st.key) for (const type of ['rawKeyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: st.key, code: st.key === ' ' ? 'Space' : st.key, windowsVirtualKeyCode: KEYCODES[st.key] || 0 });
    let value;
    if (st.js) value = await evaluate(st.js, st.timeout);
    if (st.wait) await sleep(st.wait);
    if (st.shot) {
      const s = await send('Page.captureScreenshot', { format: st.shot.endsWith('.webp') ? 'webp' : 'png', quality: st.shot.endsWith('.webp') ? 82 : undefined });
      writeFileSync(`tests/e2e/out/${st.shot}`, Buffer.from(s.result.data, 'base64'));
    }
    if ('expect' in st) {
      const ok = JSON.stringify(value) === JSON.stringify(st.expect);
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `: got ${JSON.stringify(value)}, want ${JSON.stringify(st.expect)}`}`);
      if (!ok) failed++;
    }
  }
  if (!spec.allowErrors && errors.length) { failed++; console.log(`FAIL  console errors:\n  ${errors.join('\n  ')}`); }
  if (spec.noExternal) {
    const ext = requests.filter(u => !LOCAL.test(u));
    if (ext.length) { failed++; console.log(`FAIL  external requests:\n  ${ext.join('\n  ')}`); }
  }
  sock.close(); await quit();
  return failed;
}

let total = 0;
for (const f of process.argv.slice(2)) { console.log(`\n# ${f}`); total += await runSpec(f); }
console.log(total ? `\n${total} check(s) failed` : '\nall checks passed');
process.exit(total ? 1 : 0);
