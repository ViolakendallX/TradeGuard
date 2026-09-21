// The mandatory Account A / Account B isolation test, driven through a real
// browser against the real API.
//
// WHAT IT PROVES, IN ORDER
//   1. Account A signs up and saves a trade to Trade Memory.
//   2. A signs out. Trade Memory is not reachable without a session, and a
//      hand-typed workflow hash is redirected to sign-in.
//   3. Account B signs up. B's Trade Memory is EMPTY, and none of A's text
//      appears anywhere in the rendered page.
//   4. A signs back in — with a password, not a leftover cookie — and A's trade
//      is still there, unchanged.
//   5. A refresh keeps the session; a refresh after sign-out does not.
//
// WHY THE BROWSER AND NOT JUST THE ROUTES
// The route tests prove the server scopes by session. This proves the APP does —
// that nothing in the frontend caches one account's Trade Memory, carries a
// trade across a sign-out, or renders the previous account's data behind the new
// account's name. Those are frontend failures, and only a browser can see them.
//
// Run with the dev environment up:  npm run dev  (API on 8787, Vite on 5173)

import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const APP = 'http://localhost:5173/';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PASSWORD = 'isolation-test-password';

const stamp = Date.now();
const MARKER_A = `ALPHA-MARKER-${stamp}`;
const ASSET_A = `rZETA`;
const THESIS_A = `${MARKER_A} I expect this to hold above support because momentum is intact.`;

let fails = 0;
const check = (n, c, extra = '') => {
  console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${extra ? ' — ' + extra : ''}`);
  if (!c) fails += 1;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const dir = mkdtempSync(join(tmpdir(), 'tg-isolation-'));

/**
 * Chrome is asked for port 0 and reports back which port it actually bound to.
 *
 * A fixed port is a trap: if a Chrome from an earlier run is still shutting down,
 * it still holds the port, and this harness would silently attach to THAT browser
 * — one that already has a session cookie in its profile. The run would then
 * "fail" for reasons that have nothing to do with the code. Letting Chrome pick
 * removes the possibility.
 */
const chrome = spawn(
  CHROME,
  ['--headless=new', '--disable-gpu', '--no-first-run', '--window-size=1440,900',
   '--remote-debugging-port=0', `--user-data-dir=${dir}`, 'about:blank'],
  { stdio: 'ignore' }
);

async function devtoolsPort() {
  const file = join(dir, 'DevToolsActivePort');
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

let ws = null;
let nid = 1;
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
    returnByValue: true,
    awaitPromise: true,
  });
  return r?.result?.value;
};

/** Polls an expression until it is truthy, or gives up. */
async function waitFor(expression, label, tries = 40, gap = 300) {
  for (let i = 0; i < tries; i += 1) {
    if (await ev(expression)) return true;
    await sleep(gap);
  }
  console.log(`      (timed out waiting for: ${label})`);
  return false;
}

const consoleErrors = [];

/**
 * Reloads the page and waits for the NEW document to be in place.
 *
 * A marker is set on the outgoing document first. Without this, an assertion run
 * immediately after `Page.reload` can read the old DOM — which makes a
 * "still signed in after a refresh" check pass without a refresh having happened.
 */
async function reload() {
  await ev(`(() => { window.__tgPreReload = true; return true; })()`);
  await send('Page.reload');
  await waitFor(`typeof window.__tgPreReload === 'undefined'`, 'the document to reload', 60, 250);
}

/**
 * Sets a form control's value the way React can see it.
 *
 * The prototype is taken from the element itself rather than assumed: the thesis
 * is a `<textarea>`, and calling `HTMLInputElement`'s value setter on one throws
 * "Illegal invocation" — which silently leaves the field empty and makes the form
 * look like it refused to submit.
 */
const setField = (id, value) => `(() => {
  const el = document.getElementById(${JSON.stringify(id)});
  if (!el) return false;
  const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value');
  d.set.call(el, ${JSON.stringify(value)});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
})()`;

const click = (selector) => `(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return false;
  el.click();
  return true;
})()`;

/** Fills and submits the create-account form. */
async function signUp(email) {
  await ev(click('[data-auth-link="create-account"]'));
  // Wait for the form, and for its submit to become enabled. Filling fields by
  // id while the screen is still mounting silently writes nothing (the setter
  // returns false), and the submit is then disabled — so the account is never
  // created and the failure surfaces three checks later as "B did not land in
  // the app", which is a long way from the cause.
  await waitFor(`Boolean(document.getElementById('signup-name'))`, 'the create-account form', 80, 250);
  await ev(setField('signup-name', 'Isolation Trader'));
  await ev(setField('signup-email', email));
  await ev(setField('signup-password', PASSWORD));
  await ev(setField('signup-confirmPassword', PASSWORD));
  await waitFor(
    `!document.querySelector('[data-auth-submit="create-account"]')?.disabled`,
    'the create-account submit to become enabled',
    40,
    150
  );
  await ev(click('[data-auth-submit="create-account"]'));
}

/** Fills and submits the sign-in form. */
async function signIn(email) {
  await waitFor(`Boolean(document.getElementById('signin-email'))`, 'the sign-in form', 80, 250);
  await ev(setField('signin-email', email));
  await ev(setField('signin-password', PASSWORD));
  await waitFor(
    `!document.querySelector('[data-auth-submit="login"]')?.disabled`,
    'the sign-in submit to become enabled',
    40,
    150
  );
  await ev(click('[data-auth-submit="login"]'));
}

/** Submits one trade idea on the Trade Idea screen. */
async function submitTrade() {
  await ev(setField('asset', ASSET_A));
  await ev(click('.direction__option'));
  await ev(setField('thesis', THESIS_A));
  await ev(setField('entryPrice', '100'));
  await ev(setField('invalidationPrice', '95'));
  await ev(setField('riskAmount', '50'));
  await sleep(250);
  await ev(click('[data-idea-submit]'));
}

try {
  const PORT = await devtoolsPort();

  let target = null;
  for (let i = 0; i < 60 && !target; i += 1) {
    try {
      const r = await fetch(`http://localhost:${PORT}/json`);
      target = (await r.json()).find((x) => x.type === 'page');
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  if (!target) throw new Error('no debuggable page appeared');

  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', () => rej(new Error('websocket')), { once: true });
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
  });
  await send('Page.enable');
  await send('Runtime.enable');

  const EMAIL_A = `isolation-a-${stamp}@tradeguard.test`;
  const EMAIL_B = `isolation-b-${stamp}@tradeguard.test`;

  // ---------------------------------------------------------------- 0. start
  await send('Page.navigate', { url: APP });
  await sleep(3500);
  check('a fresh browser starts at the sign-in screen',
    await ev(`Boolean(document.querySelector('[data-auth-form="login"]'))`));

  // ------------------------------------------------- 1. Account A saves a trade
  await signUp(EMAIL_A);
  check('Account A lands in the app',
    await waitFor(`Boolean(document.querySelector('.app'))`, 'app shell for A'));
  check('Account A is the account named in the topbar',
    await ev(`(document.querySelector('[data-auth-account]')?.textContent || '').includes('Isolation Trader')`));

  await submitTrade();
  check('the trade idea is submitted',
    await waitFor(`location.hash === '#/investigation'`, 'navigation to investigation'));

  // The journal save is debounced, then a real request.
  await sleep(4000);
  await send('Page.navigate', { url: `${APP}#/trade-memory` });
  await sleep(2500);

  check('Account A sees its saved trade in Trade Memory',
    await waitFor(`document.body.innerText.includes(${JSON.stringify(MARKER_A)})`, 'Account A trade in the list'));
  const aListText = await ev(`document.body.innerText`);

  // ------------------------------------------------------------- 2. A signs out
  await ev(click('[data-auth-signout]'));
  check('signing out returns to the sign-in screen',
    await waitFor(`Boolean(document.querySelector('[data-auth-form="login"]'))`, 'login screen after sign-out'));

  await send('Page.navigate', { url: `${APP}#/trade-memory` });
  await sleep(1500);
  check('a workflow hash typed after signing out is redirected to sign-in',
    await ev(`Boolean(document.querySelector('[data-auth-form="login"]'))`));
  check('the signed-out page shows none of Account A data',
    !(await ev(`document.body.innerText`)).includes(MARKER_A));

  // A refresh after signing out must stay signed out.
  //
  // The reload is confirmed before anything is asserted: reading the DOM straight
  // after `Page.reload` can hit the OLD document, which would make this check pass
  // for the wrong reason. A marker set on the outgoing document is the signal that
  // the new one is actually in place.
  await reload();
  // A reload is the one place this harness waits on a whole page boot, and a
  // boot that shows the "could not reach the server" gate is a real, different
  // failure from a boot that shows the app. Both are reported, so a flake here
  // is diagnosable instead of just red.
  const sawLoginAfterReload = await waitFor(
    `Boolean(document.querySelector('[data-auth-form="login"]'))`,
    'login screen after reload',
    120,
    250
  );
  check(
    'a refresh after signing out does NOT restore the session',
    sawLoginAfterReload,
    sawLoginAfterReload
      ? ''
      : `saw gate="${await ev(`document.querySelector('[data-session-gate]')?.getAttribute('data-session-gate') ?? ''`)}" ` +
        `app=${await ev(`Boolean(document.querySelector('.app'))`)} ` +
        `text="${(await ev(`document.body.innerText`)).slice(0, 90).replace(/\\n/g, ' ')}"`
  );

  // ------------------------------------ 3. Account B sees an empty Trade Memory
  await signUp(EMAIL_B);
  check('Account B lands in the app',
    await waitFor(`Boolean(document.querySelector('.app'))`, 'app shell for B'));

  await send('Page.navigate', { url: `${APP}#/trade-memory` });
  await sleep(2500);
  const bListText = await ev(`document.body.innerText`);

  check('Account B Trade Memory is EMPTY', !bListText.includes(MARKER_A), 'Account A marker must not appear');
  check('Account B Trade Memory says it is empty',
    /No trades saved yet/i.test(bListText),
    bListText.slice(0, 120).replace(/\n/g, ' '));
  check('Account B Trade Memory does not list Account A asset',
    !bListText.includes(ASSET_A));
  check('Account B sees the account it is signed in as',
    (await ev(`document.querySelector('[data-auth-account]')?.textContent || ''`)).includes('Isolation Trader'));

  // B can start its own trade without inheriting anything.
  await send('Page.navigate', { url: `${APP}#/trade-idea` });
  await sleep(1200);
  check('Account B starts on a blank Trade Idea form, not Account A trade',
    !(await ev(`document.getElementById('thesis')?.value || ''`)).includes(MARKER_A));

  // ------------------------------------------- 4. A signs back in and still has it
  await ev(click('[data-auth-signout]'));
  await waitFor(`Boolean(document.querySelector('[data-auth-form="login"]'))`, 'login screen before A signs back in');

  await signIn(EMAIL_A);
  check('Account A signs back in',
    await waitFor(`Boolean(document.querySelector('.app'))`, 'app shell for A again'));

  await send('Page.navigate', { url: `${APP}#/trade-memory` });
  await sleep(2500);
  check('Account A trade is still in Trade Memory after signing back in',
    await waitFor(`document.body.innerText.includes(${JSON.stringify(MARKER_A)})`, 'Account A trade after re-sign-in'));
  check('Account A thesis is preserved verbatim',
    (await ev(`document.body.innerText`)).includes(THESIS_A));

  // A refresh while signed in must keep the session.
  // Same generous budget as the sign-out reload: this is a whole page boot, and
  // the default 12s window was tight enough to fail roughly one run in four.
  await reload();
  const sawAppAfterReload = await waitFor(
    `Boolean(document.querySelector('.app'))`,
    'app shell after reload',
    120,
    250
  );
  check('a refresh while signed in keeps the session', sawAppAfterReload,
    sawAppAfterReload ? '' : `gate="${await ev(`document.querySelector('[data-session-gate]')?.getAttribute('data-session-gate') ?? ''`)}"`);
  check('after the refresh, A is still the signed-in account',
    (await ev(`document.querySelector('[data-auth-account]')?.textContent || ''`)).includes('Isolation Trader'));

  check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

  console.log(`\n${fails === 0 ? 'ALL A/B ISOLATION CHECKS PASSED' : fails + ' CHECK(S) FAILED'}`);
} catch (e) {
  console.log('HARNESS ERROR: ' + e.message);
  fails += 1;
} finally {
  try { chrome.kill(); } catch { /* already gone */ }
  process.exit(fails === 0 ? 0 : 1);
}
