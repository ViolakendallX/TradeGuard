// TradeGuard — TRADE IDEA WORKSPACE SCROLLING verification.
//
// The brief: the Trade Idea screen must behave like a trading terminal.
//   CENTRE scrolls independently · the Live Thesis column does NOT move ·
//   no blank right-hand column, ever · the aside scrolls internally only if its
//   own content outgrows its pane · the two panes never share a scroller.
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

const userDataDir = mkdtempSync(join(tmpdir(), 'tg-scroll-'));

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
const text = () => evaluate(`(document.body.innerText || '')`);

async function waitFor(expr, label, tries = 160) {
  for (let i = 0; i < tries; i += 1) {
    if (await evaluate(expr)) return true;
    await sleep(250);
  }
  throw new Error(`timeout waiting for ${label}`);
}

/**
 * One measurement pass over the workspace.
 *
 * Everything the checks need in a single round trip, so the numbers in a
 * comparison all come from the same frame.
 */
const GEO = `(() => {
  const q = (s) => document.querySelector(s);
  const box = (el) => el ? {
    top: Math.round(el.getBoundingClientRect().top),
    bottom: Math.round(el.getBoundingClientRect().bottom),
    left: Math.round(el.getBoundingClientRect().left),
    right: Math.round(el.getBoundingClientRect().right),
    height: Math.round(el.getBoundingClientRect().height),
  } : null;

  const content = q('.content[data-screen="trade-idea"]');
  const layout = q('.content[data-screen="trade-idea"] > .idea-layout');
  const centre = q('.content[data-screen="trade-idea"] .idea-layout > .card > .card__body');
  const card = q('.content[data-screen="trade-idea"] .idea-layout > .card');
  const aside = q('.idea-layout__aside');
  const thesis = q('.idea-layout__aside .card');
  const se = document.scrollingElement;

  const cs = (el) => el ? getComputedStyle(el) : null;

  return {
    viewport: { w: window.innerWidth, h: window.innerHeight },
    document: {
      overflow: se.scrollHeight - se.clientHeight,
      scrollTop: Math.round(se.scrollTop),
      bodyScrollWidth: document.body.scrollWidth,
      docScrollWidth: document.documentElement.scrollWidth,
    },
    content: content ? { box: box(content), height: cs(content).height, display: cs(content).display } : null,
    layout: layout ? { box: box(layout), gridTemplateColumns: cs(layout).gridTemplateColumns, alignItems: cs(layout).alignItems } : null,
    centre: centre ? {
      box: box(centre),
      overflowY: cs(centre).overflowY,
      overflowX: cs(centre).overflowX,
      overscrollBehavior: cs(centre).overscrollBehaviorY,
      scrollTop: Math.round(centre.scrollTop),
      scrollHeight: centre.scrollHeight,
      clientHeight: centre.clientHeight,
      scrollWidth: centre.scrollWidth,
      clientWidth: centre.clientWidth,
      canScroll: centre.scrollHeight > centre.clientHeight + 1,
    } : null,
    card: card ? { box: box(card), overflow: cs(card).overflow } : null,
    aside: aside ? {
      box: box(aside),
      position: cs(aside).position,
      top: cs(aside).top,
      overflowY: cs(aside).overflowY,
      overflowX: cs(aside).overflowX,
      overscrollBehavior: cs(aside).overscrollBehaviorY,
      scrollTop: Math.round(aside.scrollTop),
      scrollHeight: aside.scrollHeight,
      clientHeight: aside.clientHeight,
      scrollWidth: aside.scrollWidth,
      clientWidth: aside.clientWidth,
      canScroll: aside.scrollHeight > aside.clientHeight + 1,
    } : null,
    thesis: thesis ? { box: box(thesis) } : null,
    thesisVisible: thesis ? (thesis.getBoundingClientRect().bottom > 0 && thesis.getBoundingClientRect().top < window.innerHeight) : null,
    thesisFullyVisible: thesis ? (thesis.getBoundingClientRect().top >= -1 && thesis.getBoundingClientRect().bottom <= window.innerHeight + 1) : null,
    topbar: box(q('.topbar')),
    sidebar: box(q('.sidebar')),
    pageHead: box(q('.page-head')),
  };
})()`;

const setCentreScroll = (px) => evaluate(`(() => {
  const el = document.querySelector('.content[data-screen="trade-idea"] .idea-layout > .card > .card__body');
  if (!el) return null;
  el.scrollTop = ${px === 'max' ? 'el.scrollHeight' : px};
  return Math.round(el.scrollTop);
})()`);

async function setViewport(width, height, mobile = false) {
  await send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 1, mobile,
  });
  await sleep(500);
}

const FILL = async () => {
  await type('#asset', 'BTCUSDT');
  await click('.direction__option');
  await type(
    '#thesis',
    'Bitcoin is reclaiming its 200-day average with spot volume expanding and no major ' +
      'resistance until the prior range high, so a continuation move is the higher-probability path. '.repeat(3)
  );
  await type('#entryPrice', '64000');
  await type('#invalidationPrice', '61000');
  await type('#riskAmount', '500');
  await sleep(400);
};

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

  console.log('======== TRADEGUARD — TRADE IDEA WORKSPACE SCROLLING ========\n');

  /* ------------------------------------------------------------------ */
  console.log('--- 0. SESSION ---');
  await setViewport(1440, 900);
  await send('Page.navigate', { url: `${APP}#/create-account` });
  await waitFor(`Boolean(document.querySelector('[data-auth-screen="create-account"]'))`, 'create account');

  const email = `scroll-${Date.now()}@tradeguard.test`;
  await type('#signup-name', 'Scroll Harness');
  await type('#signup-email', email);
  await type('#signup-password', 'scroll-harness-password');
  await type('#signup-confirmPassword', 'scroll-harness-password');
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
  console.log('\n--- 1. SCROLL ARCHITECTURE (1440x900) ---');
  await send('Page.navigate', { url: `${APP}#/trade-idea` });
  await waitFor(`Boolean(document.querySelector('.idea-layout'))`, 'the trade idea layout');
  await FILL();

  const rest = await evaluate(GEO);
  check(
    'the screen is a workspace, not a document (the page itself does not scroll)',
    rest.document.overflow <= 1,
    `document overflow=${rest.document.overflow}px`
  );
  check(
    'the workspace is exactly the viewport minus the top bar',
    rest.content && Math.abs(rest.content.box.height - (rest.viewport.h - 62)) <= 1,
    rest.content ? `workspace=${rest.content.box.height}px, viewport=${rest.viewport.h}px, topbar=62px` : 'missing'
  );
  check('the workspace is a grid', rest.content?.display === 'grid', rest.content?.display);
  check(
    'the workspace has two columns',
    (rest.layout?.gridTemplateColumns || '').trim().split(/\s+/).length === 2,
    rest.layout?.gridTemplateColumns
  );
  check(
    'the centre column is its own scroll container',
    rest.centre?.overflowY === 'auto' && rest.centre?.overflowX === 'hidden',
    `overflow-y=${rest.centre?.overflowY}, overflow-x=${rest.centre?.overflowX}`
  );
  check(
    'the centre column has more content than it can show (so scrolling is meaningful)',
    rest.centre?.canScroll === true,
    `scrollHeight=${rest.centre?.scrollHeight}px vs clientHeight=${rest.centre?.clientHeight}px`
  );
  check(
    'the centre pane does not chain its scroll to the page',
    rest.centre?.overscrollBehavior === 'contain',
    rest.centre?.overscrollBehavior
  );
  check(
    'the Live Thesis column is anchored (position: sticky, top: 0)',
    rest.aside?.position === 'sticky' && rest.aside?.top === '0px',
    `position=${rest.aside?.position}, top=${rest.aside?.top}`
  );
  check(
    'the Live Thesis column is a scroll container of its own',
    rest.aside?.overflowY === 'auto' && rest.aside?.overflowX === 'hidden',
    `overflow-y=${rest.aside?.overflowY}, overflow-x=${rest.aside?.overflowX}`
  );
  const siblingPanes = await evaluate(`(() => {
    const centre = document.querySelector('.content[data-screen="trade-idea"] .idea-layout > .card > .card__body');
    const aside = document.querySelector('.idea-layout__aside');
    if (!centre || !aside) return null;
    return {
      asideInsideCentre: centre.contains(aside),
      centreInsideAside: aside.contains(centre),
      centreScroller: centre.scrollHeight > centre.clientHeight + 1,
      asideOwnScroller: getComputedStyle(aside).overflowY,
      scrollersInLayout: document.querySelectorAll('.content[data-screen="trade-idea"] .idea-layout > *').length,
    };
  })()`);
  check(
    'the two columns are separate panes, not one nested scroller',
    siblingPanes &&
      siblingPanes.asideInsideCentre === false &&
      siblingPanes.centreInsideAside === false,
    siblingPanes ? `aside inside centre=${siblingPanes.asideInsideCentre}, centre inside aside=${siblingPanes.centreInsideAside}` : 'missing'
  );
  check(
    'the card frame keeps its own overflow so its top hairline cannot scroll away',
    rest.card?.overflow === 'hidden',
    rest.card?.overflow
  );

  /* ------------------------------------------------------------------ */
  console.log('\n--- 2. THE KEY REQUIREMENT — CENTRE SCROLLS, RIGHT DOES NOT MOVE ---');
  const positions = [0, 0.25, 0.5, 0.75, 1];
  const samples = [];
  for (const p of positions) {
    const target = p === 'max' ? 'max' : Math.round(rest.centre.scrollHeight * p);
    await setCentreScroll(p === 1 ? 'max' : target);
    await sleep(220);
    samples.push({ p, geo: await evaluate(GEO) });
  }

  const asideTops = samples.map((s) => s.geo.aside.box.top);
  const asideBottoms = samples.map((s) => s.geo.aside.box.bottom);
  const thesisTops = samples.map((s) => s.geo.thesis.box.top);
  const topbarTops = samples.map((s) => s.geo.topbar.top);
  const sidebarTops = samples.map((s) => s.geo.sidebar.top);
  const docScrolls = samples.map((s) => s.geo.document.scrollTop);

  check(
    'the centre pane actually moved through its whole range',
    samples[samples.length - 1].geo.centre.scrollTop > 100,
    `scrollTop went 0 → ${samples[samples.length - 1].geo.centre.scrollTop}px`
  );
  check(
    'the Live Thesis column did NOT move at any scroll position',
    new Set(asideTops).size === 1 && new Set(asideBottoms).size === 1,
    `top=${asideTops.join(',')} bottom=${asideBottoms.join(',')}`
  );
  check(
    'the Live Thesis panel itself did NOT move',
    new Set(thesisTops).size === 1,
    `top=${thesisTops.join(',')}`
  );
  check(
    'the Live Thesis panel stays fully visible at every scroll position',
    samples.every((s) => s.geo.thesisFullyVisible === true),
    samples.map((s) => `${Math.round(s.p * 100)}%:${s.geo.thesisFullyVisible}`).join(' ')
  );
  check(
    'the top bar never moved',
    new Set(topbarTops).size === 1 && topbarTops[0] === 0,
    `top=${topbarTops.join(',')}`
  );
  check(
    'the sidebar never moved',
    new Set(sidebarTops).size === 1 && sidebarTops[0] === 0,
    `top=${sidebarTops.join(',')}`
  );
  check(
    'the page itself never scrolled while the centre pane did',
    docScrolls.every((v) => v === 0),
    `document scrollTop=${docScrolls.join(',')}`
  );

  /* ------------------------------------------------------------------ */
  console.log('\n--- 3. NO BLANK RIGHT-HAND COLUMN ---');
  // The blank column appeared because the aside was shorter than the centre and
  // travelled off-screen with it. The aside pane must span the full workspace
  // row at every scroll position, so there is no strip of empty column beside
  // live content.
  const asideSpansRow = samples.every(
    (s) =>
      Math.abs(s.geo.aside.box.top - s.geo.layout.box.top) <= 1 &&
      Math.abs(s.geo.aside.box.bottom - s.geo.layout.box.bottom) <= 2
  );
  check(
    'the Live Thesis pane spans the full height of the workspace at every scroll position',
    asideSpansRow,
    samples
      .map((s) => `${Math.round(s.p * 100)}%: aside ${s.geo.aside.box.top}-${s.geo.aside.box.bottom} vs row ${s.geo.layout.box.top}-${s.geo.layout.box.bottom}`)
      .join(' | ')
  );
  check(
    'the right column is never empty while the centre still has content',
    samples.every((s) => s.geo.thesisVisible === true && s.geo.aside.box.height > 200),
    samples.map((s) => `${Math.round(s.p * 100)}%: h=${s.geo.aside.box.height}`).join(' ')
  );

  /* ------------------------------------------------------------------ */
  console.log('\n--- 4. INDEPENDENT SCROLL — THE ASIDE SCROLLS ITSELF ---');
  await setCentreScroll(0);
  await sleep(200);

  // A viewport that is still tall enough for the workspace, but too short for
  // the captured thesis — the case the brief names ("scroll internally only if
  // its own content exceeds the available height").
  await setViewport(1280, 640);
  await sleep(500);
  const tight = await evaluate(GEO);
  check(
    'the workspace still applies on a short-but-usable viewport (1280x640)',
    tight.content?.display === 'grid' && tight.document.overflow <= 1,
    `display=${tight.content?.display}, document overflow=${tight.document.overflow}px`
  );
  check(
    'the Live Thesis pane is now shorter than its content',
    tight.aside?.canScroll === true,
    `scrollHeight=${tight.aside?.scrollHeight}px vs clientHeight=${tight.aside?.clientHeight}px`
  );

  const centreBefore = tight.centre.scrollTop;
  const asideScrolled = await evaluate(`(() => {
    const el = document.querySelector('.idea-layout__aside');
    el.scrollTop = 250;
    return Math.round(el.scrollTop);
  })()`);
  await sleep(250);
  const afterAside = await evaluate(GEO);
  check(
    'the Live Thesis pane scrolls internally',
    asideScrolled > 0,
    `aside scrollTop=0 → ${asideScrolled}px`
  );
  check(
    'scrolling the Live Thesis pane does not move the centre pane',
    afterAside.centre.scrollTop === centreBefore,
    `centre scrollTop=${centreBefore} → ${afterAside.centre.scrollTop}`
  );
  check(
    'the Live Thesis pane stays anchored while it scrolls internally',
    Math.abs(afterAside.aside.box.top - tight.aside.box.top) <= 1,
    `aside top=${tight.aside.box.top} → ${afterAside.aside.box.top}`
  );
  check(
    'the Live Thesis pane does not chain its scroll to the page',
    afterAside.aside.overscrollBehavior === 'contain',
    afterAside.aside.overscrollBehavior
  );
  check(
    'the two panes keep independent scroll offsets',
    afterAside.aside.scrollTop > 0 && afterAside.centre.scrollTop === 0,
    `centre=${afterAside.centre.scrollTop}, aside=${afterAside.aside.scrollTop}`
  );

  /* ------------------------------------------------------------------ */
  console.log('\n--- 5. FALLBACKS — TABLET AND SHORT VIEWPORTS ARE UNTOUCHED ---');
  await setViewport(1024, 900);
  await sleep(500);
  const tablet = await evaluate(GEO);
  check(
    'tablet (1024) collapses to one column',
    (tablet.layout?.gridTemplateColumns || '').trim().split(/\s+/).length === 1,
    tablet.layout?.gridTemplateColumns
  );
  check(
    'tablet keeps the ordinary document scroll (no trapped content)',
    tablet.document.overflow > 0 && tablet.centre?.overflowY === 'visible',
    `document overflow=${tablet.document.overflow}px, centre overflow-y=${tablet.centre?.overflowY}`
  );
  check(
    'tablet stacks the Live Thesis below the form',
    tablet.aside.box.top >= tablet.card.box.bottom - 1,
    `form ends ${tablet.card.box.bottom}, aside starts ${tablet.aside.box.top}`
  );

  await setViewport(1440, 560);
  await sleep(500);
  const short = await evaluate(GEO);
  check(
    'a short viewport falls back to the document scroll instead of cramping the panes',
    short.document.overflow > 0 && short.centre?.overflowY === 'visible',
    `document overflow=${short.document.overflow}px, centre overflow-y=${short.centre?.overflowY}`
  );
  check(
    'nothing is trapped off-screen in the short-viewport fallback',
    short.aside.box.height > 100 && short.centre.box.height > 100,
    `centre=${short.centre.box.height}px, aside=${short.aside.box.height}px`
  );

  /* ------------------------------------------------------------------ */
  console.log('\n--- 6. RESPONSIVE — NO HORIZONTAL OVERFLOW, NO SQUEEZED PANES ---');
  for (const [w, h, mobile] of [[1600, 1000, false], [1440, 900, false], [1280, 800, false], [1024, 900, false], [430, 900, true]]) {
    await setViewport(w, h, mobile);
    await send('Page.navigate', { url: `${APP}#/trade-idea` });
    await waitFor(`Boolean(document.querySelector('.idea-layout'))`, 'trade idea');
    await sleep(700);
    const g = await evaluate(GEO);

    const pageOver = Math.max(g.document.bodyScrollWidth - w, 0);
    check(
      `${w}x${h} · the page has no horizontal overflow`,
      pageOver <= 1,
      `over=${pageOver}`
    );

    if (g.centre && g.aside) {
      check(
        `${w}x${h} · the centre pane has no horizontal overflow`,
        g.centre.scrollWidth <= g.centre.clientWidth + 1,
        `scrollWidth=${g.centre.scrollWidth} clientWidth=${g.centre.clientWidth}`
      );
      check(
        `${w}x${h} · the Live Thesis pane has no horizontal overflow`,
        g.aside.scrollWidth <= g.aside.clientWidth + 1,
        `scrollWidth=${g.aside.scrollWidth} clientWidth=${g.aside.clientWidth}`
      );
    }
    if (w > 1080 && h >= 620) {
      check(
        `${w}x${h} · the workspace is active and nothing is trapped`,
        g.document.overflow <= 1 && g.centre.canScroll === true,
        `document overflow=${g.document.overflow}px, centre canScroll=${g.centre.canScroll}`
      );
    }
  }

  /* ------------------------------------------------------------------ */
  console.log('\n--- 7. FUNCTIONALITY IS UNCHANGED ---');
  await setViewport(1440, 900);
  await send('Page.navigate', { url: `${APP}#/trade-idea` });
  await waitFor(`Boolean(document.querySelector('.idea-layout'))`, 'trade idea');
  await sleep(600);
  await FILL();

  // Fill it while the centre pane is scrolled to the bottom: a form that only
  // works at scroll offset 0 would be a real regression.
  await setCentreScroll('max');
  await sleep(250);
  const submitVisible = await evaluate(`(() => {
    const b = document.querySelector('[data-idea-submit]');
    if (!b) return null;
    b.scrollIntoView({ block: 'nearest' });
    const r = b.getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) };
  })()`);
  check(
    'the hero action is reachable by scrolling the centre pane',
    submitVisible && submitVisible.h > 0,
    submitVisible ? `top=${submitVisible.top}, bottom=${submitVisible.bottom}` : 'missing'
  );

  await click('[data-idea-submit]');
  const advanced = await waitFor(
    `Boolean(document.querySelector('.inv-nav') || document.querySelector('.inv-panel'))`,
    'the investigation screen',
    120
  ).catch(() => false);
  check('submitting the trade idea still starts the investigation', advanced === true);

  const bodyText = await text();
  check(
    'the captured thesis survives the submission',
    /200-day average/.test(bodyText),
    bodyText.slice(0, 80).replace(/\s+/g, ' ')
  );

  /* ------------------------------------------------------------------ */
  console.log('\n--- 8. CONSOLE ---');
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
