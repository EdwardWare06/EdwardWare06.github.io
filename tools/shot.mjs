// Real-time headless Chrome screenshot over CDP (dev helper, not part of the site).
// usage: node shot.mjs <url> <out.png> [waitMs] [evalJs] [waitAfterEvalMs] [width] [height]
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

let [, , url, out, waitMs = '6000', evalJs = '', waitAfter = '3000', W = '1300', H = '1400'] = process.argv;
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = 9333 + Math.floor(Math.random() * 500);
const proc = spawn(chrome, [
  '--headless=new', `--remote-debugging-port=${port}`,
  `--user-data-dir=${process.env.TEMP || 'C:\\Windows\\Temp'}\\cc-cdp`,
  `--window-size=${W},${H}`, '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', 'about:blank'
], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));

let wsUrl;
for (let i = 0; i < 60 && !wsUrl; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const pg = list.find(t => t.type === 'page');
    if (pg) wsUrl = pg.webSocketDebuggerUrl;
  } catch {}
  if (!wsUrl) await sleep(200);
}
if (!wsUrl) { console.log('no CDP target'); proc.kill(); process.exit(1); }

const sock = new WebSocket(wsUrl);
await new Promise(r => (sock.onopen = r));
let id = 0;
const pending = new Map();
const logs = [];
sock.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  else if (m.method === 'Runtime.consoleAPICalled') logs.push('console.' + m.params.type + ': ' + m.params.args.map(a => a.value ?? a.description).join(' '));
  else if (m.method === 'Runtime.exceptionThrown') logs.push('EXC: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
};
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); sock.send(JSON.stringify({ id: i, method, params })); });

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: +W, height: +H, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url });
await sleep(+waitMs);
if (evalJs.startsWith('@')) evalJs = (await import('node:fs')).readFileSync(evalJs.slice(1), 'utf8');
if (evalJs.startsWith('[')) {
  // sequence mode: [{"js": "...", "wait": ms, "out": "C:\\...png"}, ...]
  for (const stp of JSON.parse(evalJs)) {
    if (stp.js) {
      const r = await send('Runtime.evaluate', { expression: stp.js, awaitPromise: true, returnByValue: true });
      logs.push('eval: ' + JSON.stringify(r.result?.result?.value ?? r.result?.exceptionDetails?.text));
    }
    await sleep(stp.wait || 0);
    if (stp.out) { const s = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(stp.out, Buffer.from(s.result.data, 'base64')); }
  }
} else if (evalJs) {
  const r = await send('Runtime.evaluate', { expression: evalJs, awaitPromise: true, returnByValue: true });
  logs.push('eval: ' + JSON.stringify(r.result?.result?.value ?? r.result?.exceptionDetails?.text));
  await sleep(+waitAfter);
}
const gpu = await send('Runtime.evaluate', {
  expression: "(()=>{const c=document.createElement('canvas').getContext('webgl2');if(!c)return 'none';const e=c.getExtension('WEBGL_debug_renderer_info');return c.getParameter(e?e.UNMASKED_RENDERER_WEBGL:c.RENDERER)})()",
  returnByValue: true
});
logs.push('renderer: ' + gpu.result?.result?.value);
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
console.log(logs.join('\n'));
sock.close();
proc.kill();
process.exit(0);
