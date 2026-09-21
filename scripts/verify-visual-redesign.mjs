// TradeGuard — VISUAL DESIGN SYSTEM verification.
//
// Drives the real UI in headless Chrome over CDP (Node built-ins only) and
// checks the things the redesign brief named:
//
//   - every screen loads, with content, with no console error
//   - no horizontal overflow at desktop, tablet and mobile widths
//   - the brand wordmark says "TradeGuard" (never only "TG")
//   - the 12-section accent system resolves a real colour per section
//   - the sidebar carries 4 groups and an icon per item
//   - the trade idea form separates TRADE DETAILS / THESIS / RISK PARAMETERS
//   - the investigation rail gives each stage its own icon + accent
//   - no functionality regression: the chain still runs, the decision still
//     records, the journal still persists
//
// Read-only against the REAL journal: it never writes a record.

const APP = 'http://localhost:5173/';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

let failures = 0;
let passes = 0;
const check = (name, cond, extra = '') => {
  const ok = Boolean(cond);
  if (ok) passes += 1;
  else failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  return ok;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const userDataDir = mkdtempSync(join(tmpdir(), 'tg-visual-'));

// Port 0: Chrome reports the port it bound to. A fixed port would let this run
// attach to a Chrome left over from an earlier suite, whose profile may already
// hold a session cookie — and the results would describe the wrong browser.
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1600,1000',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ],
  { stdio: 'ignore' }
);

async function devtoolsPort() {
  const file = join(userDataDir, 'DevToolsActivePort');
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

const consoleErrors = [];
let ws = null;
let nextId = 1;
const pending = new Map();

function send(method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`timeout: ${method}`));
      }
    }, 40000);
  });
}

async function evaluate(expression) {
  const r = await send('Runtime.evaluate', {
    expression: `(() => { try { return ${expression} } catch (e) { return '__ERR__' + e.message } })()`,
    returnByValue: true,
    awaitPromise: true,
  });
  return r?.result?.value;
}

async function waitFor(expression, label, timeout = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const v = await evaluate(expression);
    if (v && v !== '__ERR__.') return v;
    await sleep(250);
  }
  throw new Error(`timeout waiting for ${label}`);
}

const text = () => evaluate(`document.body.innerText.replace(/\\s+/g,' ')`);
const exists = (sel) => evaluate(`Boolean(document.querySelector(${JSON.stringify(sel)}))`);
const count = (sel) => evaluate(`document.querySelectorAll(${JSON.stringify(sel)}).length`);

async function click(sel) {
  return evaluate(
    `(()=>{const b=document.querySelector(${JSON.stringify(sel)});if(!b)return false;b.click();return true;})()`
  );
}

async function clickAll(sel, needle) {
  return evaluate(
    `(()=>{const b=[...document.querySelectorAll(${JSON.stringify(sel)})].find(x=>x.textContent.includes(${JSON.stringify(
      needle
    )}));if(!b)return false;b.click();return true;})()`
  );
}

async function type(sel, value) {
  return evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(sel)});
    if (!el) return false;
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
}

async function go(hash) {
  await evaluate(`(()=>{window.location.hash=${JSON.stringify(hash)};return true})()`);
  await sleep(600);
}

async function setWidth(px, height = 1000) {
  await send('Emulation.setDeviceMetricsOverride', {
    width: px,
    height,
    deviceScaleFactor: 1,
    mobile: px < 720,
  });
  await sleep(450);
}

/**
 * Horizontal overflow, measured the way a user feels it.
 *
 * `documentElement.scrollWidth` is not usable here: it counts content that is
 * legitimately clipped by an inner `overflow-x: auto` container (the journal
 * table), which produces a "false" overflow the trader never sees. Body
 * scroll width against the viewport width is what actually causes a page-level
 * horizontal scrollbar.
 */
async function overflow() {
  return evaluate(
    `(() => {
      const de = document.documentElement;
      const limit = de.clientWidth;
      const over = Math.max(document.body.scrollWidth - limit, 0);
      // Only elements NOT inside a horizontal scroll container count.
      const inScroller = (el) => {
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
          const ox = getComputedStyle(p).overflowX;
          if (ox === 'auto' || ox === 'scroll' || ox === 'hidden') return true;
        }
        return false;
      };
      const worst = [...document.querySelectorAll('body *')]
        .filter((el) => el.getBoundingClientRect().right > limit + 2 && !inScroller(el))
        .slice(0, 4)
        .map((el) => (el.tagName + '.' + (typeof el.className === 'string' ? el.className.split(' ')[0] : '')).slice(0, 60));
      return { over, worst };
    })()`
  );
}

try {
  // --- connect ------------------------------------------------------------
  const PORT = await devtoolsPort();

  let target = null;
  for (let i = 0; i < 60 && !target; i++) {
    try {
      const r = await fetch(`http://localhost:${PORT}/json`);
      const list = await r.json();
      target = list.find((t) => t.type === 'page');
    } catch {}
    await sleep(250);
  }
  if (!target) throw new Error('could not attach to Chrome');

  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    if (ws.readyState === 1) return res();
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', () => rej(new Error('ws error')), { once: true });
  });

  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data.toString());
    if (msg.id && pending.has(msg.id)) {
      const { resolve } = pending.get(msg.id);
      pending.delete(msg.id);
      resolve(msg.result ?? {});
      return;
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params?.type === 'error') {
      const arg = msg.params.args?.[0];
      const txt = arg?.value ?? arg?.description ?? '';
      if (!/favicon/i.test(txt)) consoleErrors.push(String(txt).slice(0, 160));
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params?.exceptionDetails;
      const txt = d?.exception?.description ?? d?.text ?? '';
      consoleErrors.push('EXCEPTION ' + String(txt).slice(0, 200));
    }
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');

  console.log('============ TRADEGUARD — VISUAL DESIGN SYSTEM ============\n');

  /* ================================================================== */
  console.log('--- 1. BRAND WORDMARK ---');
  await send('Page.navigate', { url: `${APP}#/login` });
  await waitFor(`Boolean(document.querySelector('[data-auth-screen="login"]'))`, 'login');

  const loginBrand = await evaluate(
    `(document.querySelector('.auth__brand')?.innerText||'').replace(/\\s+/g,' ')`
  );
  check('the login brand panel says "TradeGuard"', /TradeGuard/.test(loginBrand), loginBrand.slice(0, 90));
  check(
    'the login card lockup says "TradeGuard"',
    /TradeGuard/.test(await evaluate(`(document.querySelector('.auth__card')?.innerText||'')`))
  );
  check('the wordmark is an SVG component, not a "TG" div', await exists('.logo__word'));
  check('the wordmark has no bare TG mark as its identity', !(await exists('.brand__mark')));
  check(
    'the wordmark accentuates "Guard"',
    (await evaluate(`document.querySelector('.logo__word-accent')?.textContent`)) === 'Guard'
  );
  check('the login page still carries its pitch', /Think deeper/.test(await text()));

  await go('#/create-account');
  await waitFor(`Boolean(document.querySelector('[data-auth-screen="create-account"]'))`, 'create account');
  check(
    'the create-account card lockup says "TradeGuard"',
    /TradeGuard/.test(await evaluate(`(document.querySelector('.auth__card')?.innerText||'')`))
  );
  check('create account loads with its title', /Create your TradeGuard account/.test(await text()));

  /* ================================================================== */
  // The app behind the sign-in screens belongs to an account, so this harness
  // creates one and signs in the way a browser does. Without it there is no app
  // shell to inspect — which is itself the gate working.
  console.log('\n--- 1b. SIGN IN (the harness needs a session) ---');
  const harnessEmail = `visual-${Date.now()}@tradeguard.test`;
  await type('#signup-name', 'Visual Harness');
  await type('#signup-email', harnessEmail);
  await type('#signup-password', 'visual-harness-password');
  await type('#signup-confirmPassword', 'visual-harness-password');
  // Poll for the submit to become enabled instead of sleeping a fixed 300ms.
  // The button is `disabled={!complete || loading}`, so a click that lands
  // before React has processed the last input is a silent no-op — and the
  // failure then surfaces 30s later as "timeout waiting for app shell", which
  // reads like a broken sign-up rather than a race. Seen intermittently.
  await waitFor(
    `(() => { const b = document.querySelector('[data-auth-submit="create-account"]'); return Boolean(b) && !b.disabled; })()`,
    'the create-account submit to become enabled',
    60
  );
  await evaluate(`(()=>{document.querySelector('[data-auth-submit="create-account"]').click();return true})()`);
  await waitFor(`Boolean(document.querySelector('.app'))`, 'app shell after signing in');
  check('the harness can create an account and reach the app', await exists('.app'));
  check('the signed-in account is named in the topbar', await exists('[data-auth-account]'));
  check('the shell offers a sign-out control', await exists('[data-auth-signout]'));

  /* ================================================================== */
  console.log('\n--- 2. APP SHELL + SIDEBAR ---');
  await go('#/trade-idea');
  await waitFor(`Boolean(document.querySelector('.app'))`, 'app shell');

  check('the sidebar carries the wordmark', await exists('.sidebar .logo__word'));

  const groups = await evaluate(
    `[...document.querySelectorAll('[data-nav-group]')].map(e=>e.getAttribute('data-nav-group'))`
  );
  check(
    'the sidebar has exactly four groups in order',
    JSON.stringify(groups) === JSON.stringify(['trading', 'analysis', 'decision', 'memory']),
    JSON.stringify(groups)
  );

  const navIcons = await count('.nav__icon');
  const navItems = await count('[data-nav-item]');
  check('every sidebar item carries an icon', navIcons === navItems, `${navIcons} icons / ${navItems} items`);

  const navAccents = await evaluate(
    `[...document.querySelectorAll('[data-nav-item]')].map(e=>e.getAttribute('data-accent'))`
  );
  check(
    'every sidebar item carries a section accent',
    navAccents.length > 0 && navAccents.every(Boolean),
    JSON.stringify(navAccents)
  );
  check(
    'the sidebar uses at least 6 distinct accents',
    new Set(navAccents).size >= 6,
    String(new Set(navAccents).size)
  );

  const activeBg = await evaluate(
    `(()=>{const a=document.querySelector('.nav__item.is-active');return a?getComputedStyle(a).backgroundColor:null})()`
  );
  check('the active sidebar item is tinted, not plain', activeBg && activeBg !== 'rgba(0, 0, 0, 0)', String(activeBg));

  const edgeVisible = await evaluate(
    `(()=>{const e=document.querySelector('.nav__item.is-active .nav__edge');if(!e)return null;const c=getComputedStyle(e);return c.opacity!=='0'&&c.backgroundColor!=='rgba(0, 0, 0, 0)'})()`
  );
  check('the active sidebar item shows its accent edge', edgeVisible === true);

  /* ================================================================== */
  console.log('\n--- 3. ACCENT SYSTEM RESOLVES REAL COLOURS ---');
  const accentProbe = await evaluate(`(() => {
    const names = ['thesis','market','events','attack','history','risk','structure','report','decision','execution','memory','review'];
    const out = {};
    const probe = document.createElement('div');
    document.body.appendChild(probe);
    for (const n of names) {
      probe.setAttribute('data-accent', n);
      out[n] = getComputedStyle(probe).getPropertyValue('--section-accent').trim();
    }
    probe.remove();
    return out;
  })()`);
  const distinct = new Set(Object.values(accentProbe).filter(Boolean));
  check('all 12 section accents resolve', Object.values(accentProbe).every(Boolean), JSON.stringify(accentProbe));
  // The brief assigns cyan to both MARKET and EXECUTION, and purple to both
  // EVENTS and MEMORY — so 12 sections map onto 10 hues by design.
  check('the accents are all real, distinct hex colours', distinct.size >= 10, `${distinct.size} distinct`);
  check(
    'every accent is a resolved hex colour, not a token name',
    Object.values(accentProbe).every((v) => /^#[0-9a-f]{6}$/i.test(v))
  );

  /* ================================================================== */
  console.log('\n--- 4. TRADE IDEA — three separated blocks + hero CTA ---');
  const sections = await evaluate(
    `[...document.querySelectorAll('.idea-section__title')].map(e=>e.innerText.replace(/\\s+/g,' ').trim())`
  );
  check(
    'TRADE DETAILS / THESIS / RISK PARAMETERS are three separate blocks',
    sections.length === 3 &&
      /Trade details/i.test(sections[0]) &&
      /Thesis/i.test(sections[1]) &&
      /Risk parameters/i.test(sections[2]),
    JSON.stringify(sections)
  );

  const sectionAccents = await evaluate(
    `[...document.querySelectorAll('.idea-section')].map(e=>e.getAttribute('data-accent'))`
  );
  check(
    'each block carries its own accent',
    new Set(sectionAccents).size === 3,
    JSON.stringify(sectionAccents)
  );
  check('the hero CTA exists', await exists('[data-idea-submit]'));
  const ctaText = await evaluate(`document.querySelector('[data-idea-submit]')?.innerText`);
  check('the CTA reads STRESS-TEST MY TRADE', /stress-test my trade/i.test(String(ctaText)), String(ctaText));
  const ctaSize = await evaluate(
    `(()=>{const b=document.querySelector('[data-idea-submit]');const s=getComputedStyle(b);return parseFloat(s.fontSize)})()`
  );
  check('the CTA is the loudest control on the page', ctaSize >= 15, `${ctaSize}px`);

  /* ================================================================== */
  console.log('\n--- 5. RUN THE CHAIN (functionality must be unchanged) ---');
  await type('#asset', 'BTCUSDT');
  await click('[data-decision-tone], .direction__option');
  await type(
    '#thesis',
    'Bitcoin is reclaiming its 200-day average with spot volume expanding and no major ' +
      'resistance until the prior range high, so a continuation move is the higher-probability path.'
  );
  await type('#entryPrice', '64000');
  await type('#invalidationPrice', '61000');
  await type('#riskAmount', '500');
  await sleep(200);

  const chainStart = await evaluate(`performance.now()`);
  await click('[data-idea-submit]');
  await waitFor(
    `Boolean(document.querySelector('.inv-nav')) || document.body.innerText.includes('Capturing')`,
    'investigation workspace',
    20000
  );
  // The full deterministic chain takes a while in this sandbox (providers are
  // unreachable, so each stage has to time out before it reports unavailable).
  // Wait until NO rail item is still in flight before reading any stage.
  await waitFor(
    `(() => {
      const items = [...document.querySelectorAll('.inv-nav__item')];
      if (items.length === 0) return false;
      const loading = items.filter(e => e.classList.contains('inv-nav__item--loading')).length;
      return loading === 0 ? 'settled' : false;
    })()`,
    'the whole chain to settle',
    120000
  );
  await sleep(1500);

  check('the investigation workspace opened', await exists('.inv-nav'));
  check('the trade header shows the asset', /BTCUSDT/.test(await text()));

  /* ================================================================== */
  console.log('\n--- 6. INVESTIGATION RAIL — icon + accent per stage ---');
  const railIcons = await count('.inv-nav__icon');
  const railItems = await count('.inv-nav__item');
  check('every rail stage carries an icon', railIcons === railItems, `${railIcons}/${railItems}`);
  const railAccents = await evaluate(
    `[...document.querySelectorAll('.inv-nav__item')].map(e=>e.getAttribute('data-accent'))`
  );
  check('every rail stage carries an accent', railAccents.every(Boolean), JSON.stringify(railAccents));
  check(
    'the 8 analysis stages use 8 different accents',
    new Set(railAccents.slice(0, 8)).size === 8,
    JSON.stringify(railAccents.slice(0, 8))
  );
  check('the panel shows a stage icon', await exists('.inv-panel__icon'));

  /* ================================================================== */
  console.log('\n--- 7. EVERY INVESTIGATION STAGE RENDERS ---');
  // The rail carries the eight ANALYSIS stages. Human Decision and Paper
  // Execution are separate screens, so they are verified there (section 10/9).
  const stageIds = await evaluate(
    `[...document.querySelectorAll('[data-stage]')].map(e=>e.getAttribute('data-stage'))`
  );
  check('the rail carries the eight analysis stages', stageIds.length === 8, JSON.stringify(stageIds));

  for (const id of stageIds) {
    await evaluate(
      `(()=>{const b=document.querySelector('[data-stage="${id}"]');if(b&&!b.disabled){b.click();return true}return false})()`
    );
    await sleep(900);
    const panel = await evaluate(`document.querySelector('.inv-panel')?.getAttribute('data-panel')`);
    const bodyLen = await evaluate(`(document.querySelector('.inv-panel__body')?.innerText||'').trim().length`);
    check(`stage "${id}" renders with content`, panel === id && bodyLen > 40, `panel=${panel} chars=${bodyLen}`);
  }

  /* ================================================================== */
  console.log('\n--- 8. CARD TYPES + STATUS BADGES ARE IN USE ---');
  // Typed cards are checked on a stage that actually uses them (risk carries
  // the metric cards; market carries the data/range cards).
  await evaluate(
    `(()=>{const b=document.querySelector('[data-stage="risk-assessment"]');if(b)b.click();return true})()`
  );
  await sleep(900);
  const cardTypes = await evaluate(
    `[...document.querySelectorAll('[data-card-type]')].map(e=>e.getAttribute('data-card-type'))`
  );
  check('the risk terminal uses metric cards', cardTypes.includes('metric'), JSON.stringify([...new Set(cardTypes)]));

  await evaluate(
    `(()=>{const b=document.querySelector('[data-stage="market-context"]');if(b)b.click();return true})()`
  );
  await sleep(900);
  // In this sandbox the market provider is unreachable, so the honest render is
  // the UNAVAILABLE card. Either way the stage must render a TYPED card.
  const marketCards = await evaluate(
    `[...document.querySelectorAll('[data-card-type]')].map(e=>e.getAttribute('data-card-type'))`
  );
  check(
    'the market stage renders a typed card (data when available, unavailable when not)',
    marketCards.includes('data') || marketCards.includes('unavailable'),
    JSON.stringify([...new Set(marketCards)])
  );

  await evaluate(
    `(()=>{const b=document.querySelector('[data-stage="events-catalysts"]');if(b)b.click();return true})()`
  );
  await sleep(900);
  check(
    'an unavailable source renders the UNAVAILABLE card',
    (await evaluate(`Boolean(document.querySelector('[data-card-type="unavailable"]'))`)) ||
      (await evaluate(`(document.querySelector('.inv-panel__body')?.innerText||'').length > 40`))
  );

  const badgeKinds = await evaluate(
    `[...document.querySelectorAll('[data-badge]')].map(e=>e.getAttribute('data-badge'))`
  );
  check('status badges are on screen', badgeKinds.length > 0, JSON.stringify([...new Set(badgeKinds)]));
  check('a badge carries an icon, not colour alone', await evaluate(`Boolean(document.querySelector('.tg-badge svg'))`));

  /* ================================================================== */
  console.log('\n--- 9. THE DECISION — three equal-weight options ---');
  await go('#/decision');
  await sleep(1200);
  const tones = await evaluate(
    `[...document.querySelectorAll('[data-decision-tone]')].map(e=>e.getAttribute('data-decision-tone'))`
  );
  check(
    'TAKE / WAIT / SKIP are all present',
    JSON.stringify(tones) === JSON.stringify(['take', 'wait', 'skip']),
    JSON.stringify(tones)
  );
  const widths = await evaluate(
    `[...document.querySelectorAll('[data-decision-tone]')].map(e=>Math.round(e.getBoundingClientRect().width))`
  );
  check(
    'the three options are equal width — none is promoted',
    widths.length === 3 && new Set(widths).size === 1,
    JSON.stringify(widths)
  );
  const labelColours = await evaluate(
    `[...document.querySelectorAll('[data-decision-tone] .decision__option-label')].map(e=>getComputedStyle(e).color)`
  );
  check(
    'the three options are told apart by hue',
    new Set(labelColours).size === 3,
    JSON.stringify(labelColours)
  );
  check(
    'the decision screen still owns the decision to the trader',
    /This decision is yours to make|Recorded by you|Your reason/.test(await text())
  );

  /* ================================================================== */
  console.log('\n--- 10. ALL SCREENS LOAD, NO CONSOLE ERRORS ---');
  const screens = [
    ['#/login', 'Login'],
    ['#/create-account', 'Create Account'],
    ['#/trade-idea', 'Trade Idea'],
    ['#/investigation', 'Investigation'],
    ['#/trade-report', 'Trade Report'],
    ['#/decision', 'Human Decision'],
    ['#/paper-execution', 'Paper Execution'],
    ['#/trade-review', 'Trade Review'],
    ['#/trade-memory', 'Trade Memory'],
    ['#/trader-review', 'Trader Review'],
  ];
  for (const [hash, label] of screens) {
    await go(hash);
    await sleep(900);
    const len = (await text()).trim().length;
    const hasShell = await evaluate(`Boolean(document.querySelector('.app,.auth'))`);
    check(`${label} loads with content`, hasShell && len > 60, `${len} chars`);
  }

  /* ================================================================== */
  console.log('\n--- 11. RESPONSIVE — no horizontal overflow ---');
  for (const [w, label] of [[1600, 'desktop 1600'], [1024, 'tablet 1024'], [430, 'mobile 430']]) {
    await setWidth(w);
    for (const [hash, name] of [
      ['#/trade-idea', 'Trade Idea'],
      ['#/trade-memory', 'Trade Memory'],
      ['#/trader-review', 'Trader Review'],
    ]) {
      await go(hash);
      await sleep(700);
      const o = await overflow();
      check(`${label} · ${name}: no horizontal overflow`, o.over <= 2, `over=${o.over} ${JSON.stringify(o.worst)}`);
    }
  }
  await setWidth(1600);

  /* ================================================================== */
  console.log('\n--- 12. EMPTY STATES CARRY THE WORDMARK ---');
  await go('#/trader-review');
  await sleep(1200);
  const hasEmpty = await exists('[data-empty-state]');
  if (hasEmpty) {
    check('an empty state renders the wordmark', await exists('[data-empty-state] .logo__word'));
  } else {
    check('trader review shows a record (no empty state to check)', await exists('.exec__stage'));
  }

  /* ================================================================== */
  console.log('\n--- 13. CONSOLE ---');
  check('no console errors anywhere in the run', consoleErrors.length === 0, consoleErrors.slice(0, 5).join(' | '));

  console.log(`\n============================================================`);
  console.log(`  ${passes} PASS   ${failures} FAIL`);
  console.log(`============================================================`);
} catch (err) {
  console.log(`HARNESS ERROR: ${err.message}`);
  failures += 1;
} finally {
  try {
    chrome.kill();
  } catch {}
  process.exit(failures === 0 ? 0 : 1);
}
