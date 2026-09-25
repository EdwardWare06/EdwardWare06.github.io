// Prints /resume/ to resume/Edward-Ware-Resume.pdf with Chrome's print engine (Windows Chrome, like check.mjs).
// usage (from WSL, with npm run serve running): npm run resume-pdf
import { spawn } from 'node:child_process';
import { writeFileSync, rmSync } from 'node:fs';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = process.env.RESUME_URL || 'http://localhost:8080/resume/';
const OUT = 'resume/Edward-Ware-Resume.pdf';
const PHONE = /\(?\b\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/;
const STREET = /\b\d{1,5}\s+[NSEW]\.?\s+[A-Z][a-z]+\s+(Ave|St|Rd|Blvd|Dr|Ln)\b/;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const port = 9400 + Math.floor(Math.random() * 500);
const profile = `${process.env.TEMP || 'C:\\Windows\\Temp'}\\ew-pdf-${port}`;
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
const quit = async code => {
  if (chrome.exitCode === null) { const exited = new Promise(r => chrome.once('exit', r)); chrome.kill(); await exited; }
  for (let i = 0; i < 10; i++) { try { rmSync(profile, { recursive: true, force: true }); break; } catch { await sleep(300); } }
  process.exit(code);
};

let wsUrl;
for (let i = 0; i < 60 && !wsUrl; i++) {
  try { wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page')?.webSocketDebuggerUrl; } catch {}
  if (!wsUrl) await sleep(200);
}
if (!wsUrl) { console.log('FAIL  no DevTools target'); await quit(1); }

const sock = new WebSocket(wsUrl);
await new Promise(r => (sock.onopen = r));
let id = 0;
const pending = new Map();
sock.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); sock.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async expression => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;

await send('Page.enable');
const nav = await send('Page.navigate', { url: URL });
if (nav.result?.errorText) { console.log(`FAIL  could not load ${URL} (${nav.result.errorText}); is npm run serve running?`); await quit(1); }
await sleep(2500);
await evaluate('document.fonts.ready.then(() => true)');
// only ever print the real resume page, never an error page
if (!(await evaluate("!!document.querySelector('.resume') && document.querySelectorAll('.rs-item').length > 5"))) { console.log(`FAIL  ${URL} is not the resume page; not printing`); await quit(1); }
const text = await evaluate('document.body.innerText');
if (!text || PHONE.test(text) || STREET.test(text)) { console.log('FAIL  the resume page shows a phone number or a street address; not printing'); await quit(1); }

const pdf = await send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true, displayHeaderFooter: false });
if (!pdf.result?.data) { console.log(`FAIL  printing failed: ${pdf.error?.message || 'no data'}`); await quit(1); }
writeFileSync(OUT, Buffer.from(pdf.result.data, 'base64'));
console.log(`wrote ${OUT}`);
sock.close();
await quit(0);
