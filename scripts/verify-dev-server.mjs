// Dev-server smoke check: does the Vite app actually RENDER, can it reach the
// backend through the existing proxy, and does it gate on the session? It creates
// one throwaway account so it can see the app behind the sign-in screen.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const APP = 'http://localhost:5173/';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

let fails = 0;
const check = (n, c, extra = '') => {
  console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${extra ? ' — ' + extra : ''}`);
  if (!c) fails += 1;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const dir = mkdtempSync(join(tmpdir(), 'tg-smoke-'));

// Port 0: Chrome reports the port it bound to. A fixed port would let this run
// attach to a Chrome left over from an earlier suite — one whose profile already
// holds a session cookie — and report results about the wrong browser.
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run',
  '--window-size=1440,900', '--remote-debugging-port=0', `--user-data-dir=${dir}`, 'about:blank'],
  { stdio: 'ignore' });

async function devtoolsPort() {
  const file = join(dir, 'DevToolsActivePort');
  for (let i = 0; i < 160; i += 1) {
    try {
      const first = readFileSync(file, 'utf8').split('\n')[0].trim();
      if (first) return Number(first);
    } catch {
      /* not written yet */
    }
    await sleep(250);
  }
  throw new Error('Chrome did not report a debugging port');
}

let ws = null, nid = 1;
const pending = new Map();
const send = (m, p = {}) => {
  const id = nid++;
  ws.send(JSON.stringify({ id, method: m, params: p }));
  return new Promise((res, rej) => {
    pending.set(id, { res, rej });
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error('timeout ' + m)); } }, 30000);
  });
};
const ev = async (e) => {
  const r = await send('Runtime.evaluate', {
    expression: `(()=>{try{return ${e}}catch(err){return '__ERR__'+err.message}})()`,
    returnByValue: true, awaitPromise: true,
  });
  return r?.result?.value;
};

const consoleErrors = [];
const apiCalls = [];

try {
  const PORT = await devtoolsPort();

  let t = null;
  for (let i = 0; i < 60 && !t; i++) {
    try { const r = await fetch(`http://localhost:${PORT}/json`); t = (await r.json()).find((x) => x.type === 'page'); } catch {}
    await sleep(250);
  }
  if (!t) throw new Error('no debuggable page appeared');
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', () => rej(new Error('ws')), { once: true });
  });
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data.toString());
    if (m.id && pending.has(m.id)) { pending.get(m.id).res(m.result ?? {}); pending.delete(m.id); return; }
    if (m.method === 'Runtime.consoleAPICalled' && m.params?.type === 'error') {
      const a = m.params.args?.[0];
      const txt = a?.value ?? a?.description ?? '';
      if (!/favicon/i.test(txt)) consoleErrors.push(String(txt).slice(0, 160));
    }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params?.exceptionDetails;
      consoleErrors.push('EXCEPTION ' + String(d?.exception?.description ?? d?.text ?? '').slice(0, 200));
    }
    if (m.method === 'Network.responseReceived') {
      const u = m.params?.response?.url ?? '';
      if (u.includes('/api/')) apiCalls.push(`${m.params.response.status} ${u.replace(/^https?:\/\/[^/]+/, '')}`);
    }
  });
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');

  await send('Page.navigate', { url: APP });
  await sleep(3500);

  check('the Vite app renders into #root', await ev(`(document.getElementById('root')?.innerHTML||'').length > 500`),
    `${await ev(`(document.getElementById('root')?.innerHTML||'').length`)} chars`);
  check('React mounted the app shell', await ev(`Boolean(document.querySelector('.app, .auth'))`));

  // Signed out, the app shows the sign-in screen — and nothing else. The workflow
  // screens are not reachable until there is a session, which is the point of the
  // gate: Trade Memory belongs to an account.
  check('signed out, the sign-in screen is shown', await ev(`Boolean(document.querySelector('[data-auth-form="login"]'))`));
  check('signed out, the workflow is NOT rendered', await ev(`document.querySelectorAll('[data-nav-item]').length === 0`),
    `${await ev(`document.querySelectorAll('[data-nav-item]').length`)} nav items`);
  check('the sign-in screen carries the wordmark', await ev(`Boolean(document.querySelector('.logo__word'))`));

  // A hand-typed workflow hash must not get past the gate.
  await send('Page.navigate', { url: `${APP}#/trade-memory` });
  await sleep(1200);
  check('a workflow hash typed while signed out redirects to sign-in',
    await ev(`Boolean(document.querySelector('[data-auth-form="login"]'))`));
  check('the redirect is reflected in the hash', await ev(`location.hash === '#/login'`),
    await ev(`location.hash`));

  // Sign in for real, through the form.
  const email = `smoke-${Date.now()}@tradeguard.test`;
  await ev(`(() => {
    const set = (el, v) => {
      const d = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value');
      d.set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    document.querySelector('[data-auth-link="create-account"]').click();
    return true;
  })()`);
  await sleep(600);

  const typed = await ev(`(() => {
    const set = (id, v) => {
      const el = document.getElementById(id);
      if (!el) return false;
      const d = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value');
      d.set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    };
    return [
      set('signup-name', 'Smoke Trader'),
      set('signup-email', ${JSON.stringify(email)}),
      set('signup-password', 'smoke-test-password'),
      set('signup-confirmPassword', 'smoke-test-password'),
    ].every(Boolean);
  })()`);
  check('the create-account form accepts input', typed === true);

  await sleep(300);
  await ev(`(() => { document.querySelector('[data-auth-submit="create-account"]').click(); return true; })()`);
  await sleep(3000);

  check('creating an account lands in the app', await ev(`Boolean(document.querySelector('.app'))`));
  check('the sidebar wordmark is present', await ev(`Boolean(document.querySelector('.sidebar .logo__word'))`));
  check('the workflow navigation is present', await ev(`document.querySelectorAll('[data-nav-item]').length >= 8`),
    `${await ev(`document.querySelectorAll('[data-nav-item]').length`)} items`);
  check('the Trade Idea screen is the default', await ev(`document.body.innerText.includes('What are you thinking?')`));
  check('the backend is reported online in the UI', await ev(`document.body.innerText.includes('API online')`));
  check('the signed-in account is named in the topbar',
    await ev(`Boolean(document.querySelector('[data-auth-account]'))`));
  check('the frontend reached the backend through the proxy', apiCalls.some((c) => c.startsWith('200 /api/')),
    JSON.stringify(apiCalls.slice(0, 4)));
  check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

  console.log(`\n${fails === 0 ? 'ALL DEV-SERVER SMOKE CHECKS PASSED' : fails + ' CHECK(S) FAILED'}`);
} catch (e) {
  console.log('HARNESS ERROR: ' + e.message);
  fails += 1;
} finally {
  try { chrome.kill(); } catch {}
  process.exit(fails === 0 ? 0 : 1);
}
