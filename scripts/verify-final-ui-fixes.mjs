// TradeGuard — FINAL UI FIXES verification.
//
// Two changes, and nothing else:
//   1. Native <select> dropdown options were rendering near-white on the
//      platform's default WHITE popup. `.select` sets its surface with a
//      gradient, which leaves `background-color` transparent, so the popup fell
//      back to the default list while still inheriting the field's near-white
//      `color`.
//   2. The sidebar's "Build status" card is gone — developer information in a
//      trader-facing product.
//
// Drives the real UI in headless Chrome over CDP (Node built-ins only).
// Read-only against the REAL journal: it never writes a saved record.

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

const userDataDir = mkdtempSync(join(tmpdir(), 'tg-final-'));

// Port 0: Chrome reports the port it bound to, so this can never attach to a
// Chrome left over from another suite whose profile already holds a session.
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

let ws = null;
let nextId = 1;
const pending = new Map();
const consoleErrors = [];

const send = (method, params = {}) => {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`timeout ${method}`));
      }
    }, 40000);
  });
};

const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', {
    expression: `(() => { try { return ${expression} } catch (e) { return '__ERR__' + e.message } })()`,
    returnByValue: true,
    awaitPromise: true,
  });
  const value = r?.result?.value;
  if (typeof value === 'string' && value.startsWith('__ERR__')) throw new Error(value);
  return value;
};

const type = (selector, value) =>
  evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    const proto = el.tagName === 'TEXTAREA'
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);

const click = (selector) =>
  evaluate(`(() => { const b = document.querySelector(${JSON.stringify(selector)}); if (!b) return false; b.click(); return true; })()`);

const exists = (selector) => evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);

async function waitFor(expr, label, tries = 160) {
  for (let i = 0; i < tries; i += 1) {
    if (await evaluate(expr)) return true;
    await sleep(250);
  }
  throw new Error(`timeout waiting for ${label}`);
}

/**
 * Contrast + surface audit of every native option in the document.
 *
 * The bug was "white text on a white popup", so the assertions are the two
 * properties that produce it: an option's background must be OPAQUE (a
 * transparent value is exactly how the platform's white default leaks back in)
 * and the text must actually contrast against it.
 */
const AUDIT_OPTIONS = `(() => {
  const parse = (s) => {
    const m = String(s).match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const p = m[1].split(/[,\\s/]+/).filter(Boolean).map(Number);
    if (p.length < 3) return null;
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lum = (c) => {
    const f = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const contrast = (a, b) => {
    const la = lum(a), lb = lum(b);
    const hi = Math.max(la, lb), lo = Math.min(la, lb);
    return (hi + 0.05) / (lo + 0.05);
  };
  const round = (n) => Math.round(n * 100) / 100;

  const selects = [...document.querySelectorAll('select')];
  const rows = [];
  for (const sel of selects) {
    const scs = getComputedStyle(sel);
    const opts = [...sel.querySelectorAll('option')];
    for (const o of opts) {
      const cs = getComputedStyle(o);
      const bg = parse(cs.backgroundColor);
      const fg = parse(cs.color);
      rows.push({
        selectId: sel.id || sel.name || '(unnamed)',
        label: o.textContent.trim(),
        selected: o.selected,
        bgRaw: cs.backgroundColor,
        fgRaw: cs.color,
        bgAlpha: bg ? bg.a : null,
        bgLum: bg ? round(lum(bg)) : null,
        fgLum: fg ? round(lum(fg)) : null,
        contrast: bg && fg ? round(contrast(bg, fg)) : null,
      });
    }
    rows.push({
      selectId: sel.id || sel.name || '(unnamed)',
      control: true,
      bgRaw: scs.backgroundColor,
      fgRaw: scs.color,
      colorScheme: scs.colorScheme,
      hasGradient: /gradient/.test(scs.backgroundImage),
    });
  }
  return {
    selectCount: selects.length,
    optionCount: rows.filter((r) => !r.control).length,
    rows,
    labelsBySelect: selects.map((s) => ({
      id: s.id || s.name || '(unnamed)',
      labels: [...s.querySelectorAll('option')].map((o) => o.textContent.trim()),
    })),
  };
})()`;

try {
  const PORT = await devtoolsPort();

  let target = null;
  for (let i = 0; i < 60 && !target; i++) {
    try {
      const r = await fetch(`http://localhost:${PORT}/json`);
      target = (await r.json()).find((x) => x.type === 'page');
    } catch { /* not up yet */ }
    await sleep(250);
  }
  if (!target) throw new Error('no debuggable page appeared');

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
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });

  console.log('=========== TRADEGUARD — FINAL UI FIXES ===========\n');

  /* ------------------------------------------------------------------ */
  console.log('--- 0. SESSION ---');
  await send('Page.navigate', { url: `${APP}#/create-account` });
  await waitFor(`Boolean(document.querySelector('[data-auth-screen="create-account"]'))`, 'create account');

  const email = `final-${Date.now()}@tradeguard.test`;
  await type('#signup-name', 'Final Harness');
  await type('#signup-email', email);
  await type('#signup-password', 'final-harness-password');
  await type('#signup-confirmPassword', 'final-harness-password');
  // Poll for the submit to become enabled rather than sleeping a fixed 300ms:
  // the button is `disabled={!complete || loading}`, so a click that lands
  // before React processes the last input is a silent no-op and the failure
  // then reads as "timeout waiting for the app shell".
  await waitFor(
    `(() => { const b = document.querySelector('[data-auth-submit="create-account"]'); return Boolean(b) && !b.disabled; })()`,
    'the create-account submit to become enabled',
    60
  );
  await click('[data-auth-submit="create-account"]');
  await waitFor(`Boolean(document.querySelector('.app'))`, 'the app shell');
  check('the harness can reach the app shell', await exists('.app'));

  /* ------------------------------------------------------------------ */
  console.log('\n--- 1. NATIVE SELECT OPTIONS ARE READABLE ---');
  await send('Page.navigate', { url: `${APP}#/trade-idea` });
  await waitFor(`Boolean(document.querySelector('#existingPosition'))`, 'the trade idea form');
  await sleep(600);

  const audit = await evaluate(AUDIT_OPTIONS);
  const options = audit.rows.filter((r) => !r.control);
  const controls = audit.rows.filter((r) => r.control);

  check(
    'both Trade Idea selects are present',
    audit.selectCount === 2,
    `${audit.selectCount} native selects, ${audit.optionCount} options`
  );

  // Every option and its behaviour must be preserved, in order.
  const timeframe = audit.labelsBySelect.find((s) => s.id === 'timeframe');
  const position = audit.labelsBySelect.find((s) => s.id === 'existingPosition');
  const EXPECTED_TIMEFRAME = [
    'Not specified', 'Intraday', 'Swing (days)', 'Short-term (1–2 weeks)',
    'Position (months)', 'Earnings event', 'Macro event',
  ];
  const EXPECTED_POSITION = [
    'Not specified', 'No existing position', 'Already long', 'Already short',
  ];
  check(
    'Timeframe still offers all 7 options, in order',
    JSON.stringify(timeframe?.labels) === JSON.stringify(EXPECTED_TIMEFRAME),
    JSON.stringify(timeframe?.labels)
  );
  check(
    'Existing position still offers all 4 options, in order',
    JSON.stringify(position?.labels) === JSON.stringify(EXPECTED_POSITION),
    JSON.stringify(position?.labels)
  );

  const transparent = options.filter((o) => o.bgAlpha !== 1);
  check(
    'every option has an OPAQUE background (a transparent one is how the white default leaked back in)',
    transparent.length === 0,
    transparent.length
      ? transparent.map((o) => `${o.label}: ${o.bgRaw}`).join(' | ')
      : `all ${options.length} options opaque`
  );

  const lightBgs = options.filter((o) => o.bgLum !== null && o.bgLum > 0.15);
  check(
    'every option background is dark, not white',
    lightBgs.length === 0,
    lightBgs.length
      ? lightBgs.map((o) => `${o.label}: lum ${o.bgLum} (${o.bgRaw})`).join(' | ')
      : `darkest-to-lightest option background luminance ≤ 0.15`
  );

  const darkTexts = options.filter((o) => o.fgLum !== null && o.fgLum < 0.55);
  check(
    'every option label is light text',
    darkTexts.length === 0,
    darkTexts.length ? darkTexts.map((o) => `${o.label}: lum ${o.fgLum}`).join(' | ') : 'all labels light'
  );

  const lowContrast = options.filter((o) => o.contrast !== null && o.contrast < 4.5);
  const worst = options.reduce((m, o) => Math.min(m, o.contrast ?? 99), 99);
  check(
    'every option meets WCAG AA contrast (≥ 4.5:1) against its own background',
    lowContrast.length === 0,
    `worst ratio ${worst}:1 across ${options.length} options`
  );

  /* A passing check is worth nothing if it could not have failed. The original
     defect was an option with NO background of its own — so force exactly that
     and confirm the audit reports it, then confirm the fix restores it. */
  await evaluate(`(() => {
    const s = document.createElement('style');
    s.id = 'tg-negative-control';
    s.textContent = 'select option { background-color: transparent !important; }';
    document.head.appendChild(s);
    return true;
  })()`);
  await sleep(250);
  const broken = await evaluate(AUDIT_OPTIONS);
  const brokenTransparent = broken.rows.filter((r) => !r.control && r.bgAlpha !== 1);
  check(
    'the readability audit is not vacuous — forcing the original defect makes it fail',
    brokenTransparent.length === broken.optionCount,
    `${brokenTransparent.length}/${broken.optionCount} options went transparent under the negative control`
  );

  await evaluate(`(() => { const s = document.getElementById('tg-negative-control'); if (s) s.remove(); return true; })()`);
  await sleep(250);
  const restored = await evaluate(AUDIT_OPTIONS);
  const restoredTransparent = restored.rows.filter((r) => !r.control && r.bgAlpha !== 1);
  check(
    'and removing the defect restores every option to an opaque background',
    restoredTransparent.length === 0,
    `${restored.optionCount - restoredTransparent.length}/${restored.optionCount} opaque again`
  );

  // The selected row must be visibly different from the unselected rows.
  const selected = options.find((o) => o.selected);
  const unselected = options.filter((o) => !o.selected);
  check(
    'the selected option is distinguishable from the others',
    selected && unselected.every((o) => o.bgRaw !== selected.bgRaw),
    selected
      ? `selected "${selected.label}" bg ${selected.bgRaw} vs unselected ${unselected[0]?.bgRaw}`
      : 'no selected option found'
  );

  check(
    'the selects still use the design system surface (no new component, gradient intact)',
    controls.length === 2 && controls.every((c) => c.hasGradient === true),
    controls.map((c) => `${c.selectId}: gradient=${c.hasGradient}`).join(' | ')
  );
  check(
    'the selects declare a dark color-scheme so the popup chrome is dark too',
    controls.every((c) => /dark/.test(c.colorScheme)),
    controls.map((c) => `${c.selectId}: ${c.colorScheme}`).join(' | ')
  );

  // The closed control must still be readable on its own gradient surface.
  const closed = await evaluate(`(() => {
    const parse = (s) => { const m = String(s).match(/rgba?\\(([^)]+)\\)/); if (!m) return null;
      const p = m[1].split(/[,\\s/]+/).filter(Boolean).map(Number);
      return p.length < 3 ? null : { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
    const lum = (c) => { const f = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
    const el = document.querySelector('#existingPosition');
    const cs = getComputedStyle(el);
    return { color: cs.color, lum: Math.round(lum(parse(cs.color)) * 100) / 100 };
  })()`);
  check(
    'the closed select control still renders light text',
    closed.lum > 0.55,
    `color=${closed.color} luminance=${closed.lum}`
  );

  /* ------------------------------------------------------------------ */
  console.log('\n--- 2. BUILD STATUS IS GONE ---');
  const sidebar = await evaluate(`(() => {
    const sb = document.querySelector('.sidebar');
    if (!sb) return null;
    const t = (sb.innerText || '');
    return {
      text: t,
      hasFooterEl: Boolean(sb.querySelector('.sidebar__footer')),
      hasFooterTitle: Boolean(sb.querySelector('.sidebar__footer-title')),
      hasFooterNote: Boolean(sb.querySelector('.sidebar__footer-note')),
      childClasses: [...sb.children].map((c) => c.className),
      lastChildClass: sb.lastElementChild ? sb.lastElementChild.className : null,
      groupCount: sb.querySelectorAll('[data-nav-group]').length,
      itemCount: sb.querySelectorAll('[data-nav-item]').length,
      apiDotInSidebar: sb.querySelectorAll('.status-dot').length,
    };
  })()`);

  check('the sidebar renders', Boolean(sidebar));
  check(
    'no "Build status" card element remains in the sidebar',
    sidebar && sidebar.hasFooterEl === false && sidebar.hasFooterTitle === false && sidebar.hasFooterNote === false,
    `footer=${sidebar?.hasFooterEl}, title=${sidebar?.hasFooterTitle}, note=${sidebar?.hasFooterNote}`
  );
  check(
    'the words "Build status" are gone from the sidebar',
    sidebar && !/build status/i.test(sidebar.text),
    (sidebar?.text || '').slice(0, 70).replace(/\s+/g, ' ')
  );
  check(
    'the developer line "Phases 1–13 complete" is gone from the sidebar',
    sidebar && !/phases?\s*1\s*[–-]\s*13/i.test(sidebar.text),
    sidebar && /phases?\s*1\s*[–-]\s*13/i.test(sidebar.text) ? 'STILL PRESENT' : 'absent'
  );
  check(
    'the "Backend connected / offline" line is gone from the sidebar',
    sidebar && !/backend (connected|offline)/i.test(sidebar.text),
    sidebar && /backend (connected|offline)/i.test(sidebar.text) ? 'STILL PRESENT' : 'absent'
  );
  check(
    'the sidebar ends naturally after the navigation',
    sidebar && sidebar.lastChildClass === 'nav',
    `last child = ${sidebar?.lastChildClass}`
  );
  check(
    'no status dot was left behind in the sidebar',
    sidebar && sidebar.apiDotInSidebar === 0,
    `${sidebar?.apiDotInSidebar} status dots`
  );
  check(
    'the navigation itself is untouched (4 groups, 8 items)',
    sidebar && sidebar.groupCount === 4 && sidebar.itemCount === 8,
    `${sidebar?.groupCount} groups, ${sidebar?.itemCount} items`
  );

  // The topbar indicator must survive — the fix was the SIDEBAR card only.
  const topbar = await evaluate(`(() => {
    const tb = document.querySelector('.topbar');
    if (!tb) return null;
    return { text: tb.innerText, hasStatusDot: Boolean(tb.querySelector('.status-dot')), hasSignout: Boolean(tb.querySelector('[data-auth-signout]')) };
  })()`);
  check(
    'the API Online indicator in the top header is unchanged',
    topbar && topbar.hasStatusDot === true && /api (online|offline)/i.test(topbar.text),
    topbar ? `dot=${topbar.hasStatusDot}, text has API status=${/api (online|offline)/i.test(topbar.text)}` : 'no topbar'
  );
  check('the account controls are unchanged', topbar && topbar.hasSignout === true);

  // The health functionality itself must be untouched.
  const health = await evaluate(`fetch('/api/health').then(r => r.ok ? r.json() : null).catch(() => null)`);
  check(
    'the backend health endpoint still answers',
    health && health.status === 'ok',
    health ? JSON.stringify(health) : 'unreachable'
  );

  /* ------------------------------------------------------------------ */
  console.log('\n--- 3. SIDEBAR NAVIGATION STILL WORKS ---');
  const navIds = await evaluate(`[...document.querySelectorAll('[data-nav-item]')].filter(b => !b.disabled).map(b => b.dataset.navItem)`);
  let navigated = 0;
  for (const id of navIds) {
    await click(`[data-nav-item="${id}"]`);
    await sleep(500);
    const isActive = await evaluate(`Boolean(document.querySelector('[data-nav-item="${id}"].is-active'))`);
    const rendered = await evaluate(`Boolean(document.querySelector('.content') && document.querySelector('.content').innerText.trim().length > 0)`);
    if (isActive && rendered) navigated += 1;
  }
  check(
    'every enabled navigation item still selects and renders its screen',
    navigated === navIds.length,
    `${navigated}/${navIds.length} items (${navIds.join(', ')})`
  );

  /* ------------------------------------------------------------------ */
  console.log('\n--- 4. TRADE IDEA SCROLLING IS STILL INTACT ---');
  await send('Page.navigate', { url: `${APP}#/trade-idea` });
  await waitFor(`Boolean(document.querySelector('.idea-layout'))`, 'trade idea');
  await type('#asset', 'BTCUSDT');
  await click('.direction__option');
  await type('#thesis', 'Bitcoin is reclaiming its 200-day average with spot volume expanding and no major resistance until the prior range high, so a continuation move is the higher-probability path. '.repeat(3));
  await sleep(500);

  const scroll = await evaluate(`(() => {
    const centre = document.querySelector('.content[data-screen="trade-idea"] .idea-layout > .card > .card__body');
    const aside = document.querySelector('.idea-layout__aside');
    if (!centre || !aside) return null;
    const before = aside.getBoundingClientRect().top;
    centre.scrollTop = centre.scrollHeight;
    return { before: Math.round(before) };
  })()`);
  await sleep(400);
  const scrollAfter = await evaluate(`(() => {
    const centre = document.querySelector('.content[data-screen="trade-idea"] .idea-layout > .card > .card__body');
    const aside = document.querySelector('.idea-layout__aside');
    const thesis = document.querySelector('.idea-layout__aside .card');
    const se = document.scrollingElement;
    return {
      centreScrollTop: Math.round(centre.scrollTop),
      asideTop: Math.round(aside.getBoundingClientRect().top),
      asidePosition: getComputedStyle(aside).position,
      centreOverflowY: getComputedStyle(centre).overflowY,
      documentOverflow: se.scrollHeight - se.clientHeight,
      thesisVisible: thesis ? (thesis.getBoundingClientRect().top >= -1 && thesis.getBoundingClientRect().bottom <= window.innerHeight + 1) : null,
    };
  })()`);

  check(
    'the centre column is still its own scroll container',
    scrollAfter.centreOverflowY === 'auto' && scrollAfter.centreScrollTop > 100,
    `overflow-y=${scrollAfter.centreOverflowY}, scrolled to ${scrollAfter.centreScrollTop}px`
  );
  check(
    'the Live Thesis column still does not move when the centre scrolls',
    scrollAfter.asideTop === scroll.before && scrollAfter.asidePosition === 'sticky',
    `aside top ${scroll.before} → ${scrollAfter.asideTop}`
  );
  check(
    'the Live Thesis panel is still fully visible at the bottom of the form',
    scrollAfter.thesisVisible === true
  );
  check(
    'the page itself still does not scroll on Trade Idea',
    scrollAfter.documentOverflow <= 1,
    `document overflow=${scrollAfter.documentOverflow}px`
  );

  /* ------------------------------------------------------------------ */
  console.log('\n--- 5. RESPONSIVE — NO HORIZONTAL OVERFLOW ---');
  for (const [w, h, mobile] of [[1600, 1000, false], [1440, 900, false], [1024, 900, false], [430, 900, true]]) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
    await send('Page.navigate', { url: `${APP}#/trade-idea` });
    await waitFor(`Boolean(document.querySelector('.idea-layout'))`, 'trade idea');
    await sleep(700);
    const g = await evaluate(`(() => ({
      bodyScrollWidth: document.body.scrollWidth,
      sidebarFooter: Boolean(document.querySelector('.sidebar__footer')),
      sidebarText: (document.querySelector('.sidebar')?.innerText || '').includes('Build status'),
    }))()`);
    const over = Math.max(g.bodyScrollWidth - w, 0);
    check(`${w}x${h} · no horizontal overflow`, over <= 1, `over=${over}`);
    check(
      `${w}x${h} · Build status is still absent`,
      g.sidebarFooter === false && g.sidebarText === false
    );
  }

  /* ------------------------------------------------------------------ */
  console.log('\n--- 6. CONSOLE ---');
  check(
    'no console errors anywhere in the run',
    consoleErrors.length === 0,
    consoleErrors.slice(0, 5).join(' | ')
  );

  console.log('\n============================================================');
  console.log(`  ${passes} PASS   ${failures} FAIL`);
  console.log('============================================================');
} catch (e) {
  console.log('ERR', e.message);
  failures += 1;
} finally {
  try { chrome.kill(); } catch { /* already gone */ }
  process.exit(failures === 0 ? 0 : 1);
}
