// Capture screenshots of the redesigned TradeGuard screens for visual review.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const APP = 'http://localhost:5173/';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = 'C:\\Users\\HP\\Desktop\\TradeGuard\\.visual-shots';

mkdirSync(OUT, { recursive: true });

const d = mkdtempSync(join(tmpdir(), 'tg-shots-'));

// Port 0: Chrome reports the port it bound to, so this can never attach to a
// Chrome left over from another suite.
const chrome = spawn(
  CHROME,
  ['--headless=new', '--disable-gpu', '--no-first-run', '--window-size=1600,1000',
    '--remote-debugging-port=0', `--user-data-dir=${d}`, 'about:blank'],
  { stdio: 'ignore' }
);

async function devtoolsPort() {
  const file = join(d, 'DevToolsActivePort');
  for (let i = 0; i < 160; i += 1) {
    try {
      const first = readFileSync(file, 'utf8').split('\n')[0].trim();
      if (first) return Number(first);
    } catch {
      /* not written yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Chrome did not report a debugging port');
}

let ws = null, nid = 1;
const p = new Map();
const send = (m, pr = {}) => {
  const id = nid++;
  ws.send(JSON.stringify({ id, method: m, params: pr }));
  return new Promise((res, rej) => {
    p.set(id, { res, rej });
    setTimeout(() => { if (p.has(id)) { p.delete(id); rej(new Error('timeout ' + m)); } }, 40000);
  });
};
const ev = async (e) => {
  const r = await send('Runtime.evaluate', { expression: `(()=>{try{return ${e}}catch(err){return '__ERR__'+err.message}})()`, returnByValue: true, awaitPromise: true });
  return r?.result?.value;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(OUT, name + '.png'), Buffer.from(r.data, 'base64'));
  console.log('  saved', name);
}

async function type(sel, value) {
  return ev(`(() => {
    const el = document.querySelector(${JSON.stringify(sel)});
    if (!el) return false;
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
}
const click = (sel) => ev(`(()=>{const b=document.querySelector(${JSON.stringify(sel)});if(!b)return false;b.click();return true})()`);

/**
 * Poll for a condition instead of sleeping a fixed amount.
 *
 * A fixed wait is a race: the first navigation of a run also pays Vite's cold
 * transform, so `sleep(1800)` captured the session gate instead of the sign-in
 * card — the shot looked like a broken login page when it was simply a page
 * that had not finished loading.
 */
async function waitFor(expr, label, tries = 160) {
  for (let i = 0; i < tries; i += 1) {
    if (await ev(expr)) return true;
    await sleep(250);
  }
  throw new Error('timeout waiting for ' + label);
}

try {
  const PORT = await devtoolsPort();

  let t = null;
  for (let i = 0; i < 60 && !t; i++) {
    try { const r = await fetch(`http://localhost:${PORT}/json`); t = (await r.json()).find((x) => x.type === 'page'); } catch {}
    await sleep(250);
  }
  if (!t) throw new Error('no debuggable page appeared');
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', () => rej(new Error('ws')), { once: true }); });
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data.toString()); if (m.id && p.has(m.id)) { p.get(m.id).res(m.result ?? {}); p.delete(m.id); } });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });

  await send('Page.navigate', { url: APP + '#/login' });
  await waitFor(`Boolean(document.querySelector('[data-auth-screen="login"]'))`, 'the sign-in screen');
  await sleep(500);
  await shot('01-login');

  await send('Page.navigate', { url: APP + '#/create-account' });
  await waitFor(`Boolean(document.querySelector('[data-auth-screen="create-account"]'))`, 'create account');
  await sleep(500);
  await shot('02-create-account');

  // The workflow screens live behind an account, so the run creates one before
  // capturing them. Without this every shot from here on would be the sign-in
  // screen — which is the gate working, but not what these shots are for.
  await type('#signup-name', 'Visual Review');
  await type('#signup-email', `shots-${Date.now()}@tradeguard.test`);
  await type('#signup-password', 'visual-review-password');
  await type('#signup-confirmPassword', 'visual-review-password');
  // Poll for the submit to become enabled rather than sleeping a fixed 300ms:
  // the button is `disabled={!complete || loading}`, so a click that lands
  // before React processes the last input is a silent no-op and every shot from
  // here on would be the sign-in screen.
  await waitFor(
    `(() => { const b = document.querySelector('[data-auth-submit="create-account"]'); return Boolean(b) && !b.disabled; })()`,
    'the create-account submit to become enabled',
    60
  );
  await click('[data-auth-submit="create-account"]');
  await waitFor(`Boolean(document.querySelector('.app'))`, 'the app shell after signing up');

  await send('Page.navigate', { url: APP + '#/trade-idea' });
  await sleep(1500);
  await shot('03-trade-idea');

  // run the chain
  await type('#asset', 'BTCUSDT');
  await click('.direction__option');
  await type('#thesis', 'Bitcoin is reclaiming its 200-day average with spot volume expanding and no major resistance until the prior range high, so a continuation move is the higher-probability path.');
  await type('#entryPrice', '64000');
  await type('#invalidationPrice', '61000');
  await type('#riskAmount', '500');
  await sleep(300);

  // The workspace-scrolling evidence. With the form filled, scroll the CENTRE
  // pane and capture it: the Live Thesis column has to stay exactly where it is,
  // so the right-hand side can never read as a blank column beside live content.
  const scrollCentre = (expr) => ev(`(() => {
    const el = document.querySelector('.content[data-screen="trade-idea"] .idea-layout > .card > .card__body');
    if (!el) return null;
    el.scrollTop = ${expr};
    return Math.round(el.scrollTop);
  })()`);

  await scrollCentre('el.scrollHeight * 0.5');
  await sleep(600);
  await shot('20-trade-idea-centre-scrolled');
  await scrollCentre('el.scrollHeight');
  await sleep(600);
  await shot('21-trade-idea-centre-scrolled-bottom');
  await scrollCentre(0);
  await sleep(400);
  await click('[data-idea-submit]');
  for (let i = 0; i < 200; i++) {
    const loading = await ev(`[...document.querySelectorAll('.inv-nav__item--loading')].length`);
    if (loading === 0 && (await ev(`Boolean(document.querySelector('.inv-nav'))`))) break;
    await sleep(1000);
  }
  await sleep(1500);
  await shot('04-investigation-thesis');

  for (const [id, name] of [
    ['market-context', '05-market'],
    ['contradicting-evidence', '06-attack'],
    ['risk-assessment', '07-risk'],
    ['trade-structure', '08-structure'],
    ['final-report', '09-report'],
  ]) {
    await ev(`(()=>{const b=document.querySelector('[data-stage="${id}"]');if(b)b.click();return true})()`);
    await sleep(1200);
    await shot(name);
  }

  for (const [hash, name] of [
    ['#/decision', '10-decision'],
    ['#/paper-execution', '11-execution'],
    ['#/trade-review', '12-trade-review'],
    ['#/trade-memory', '13-trade-memory'],
    ['#/trader-review', '14-trader-review'],
  ]) {
    await send('Page.navigate', { url: APP + hash });
    await sleep(2000);
    await shot(name);
  }

  // mobile
  await send('Emulation.setDeviceMetricsOverride', { width: 430, height: 1000, deviceScaleFactor: 1, mobile: true });
  await send('Page.navigate', { url: APP + '#/trade-idea' });
  await sleep(1800);
  await shot('15-mobile-trade-idea');
  await send('Page.navigate', { url: APP + '#/trade-memory' });
  await sleep(1800);
  await shot('16-mobile-trade-memory');
  await send('Page.navigate', { url: APP + '#/investigation' });
  await sleep(2500);
  await shot('17-mobile-investigation');

  // tablet — the width where the rail and the workspace have to share space
  await send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: APP + '#/trade-idea' });
  await sleep(1800);
  await shot('18-tablet-trade-idea');
  await send('Page.navigate', { url: APP + '#/trade-memory' });
  await sleep(1800);
  await shot('19-tablet-trade-memory');
} catch (e) {
  console.log('ERR', e.message);
} finally {
  try { chrome.kill(); } catch {}
  process.exit(0);
}
