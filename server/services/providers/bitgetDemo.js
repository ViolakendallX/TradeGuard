/**
 * Bitget DEMO (paper) trading provider (Phase 10).
 *
 * This module isolates ALL Bitget-specific execution knowledge: credential
 * discovery, the demo endpoint, request signing, and response extraction. The
 * rest of TradeGuard never sees an exchange-shaped object — it hands this module
 * a TradeGuard order intent and gets back a plain result.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS MODULE ONLY EVER TALKS TO THE DEMO / PAPER ENVIRONMENT.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The safety rules are structural, not conventional:
 *
 *   - The base URL is read from `TRADEGUARD_BITGET_DEMO_API_BASE` and defaults
 *     to Bitget's demo host. There is no live host constant anywhere in this
 *     file, so there is no URL to "switch" to.
 *   - Credentials come from DEMO-specific variables only. Live variables are
 *     never read here.
 *   - There is no live fallback. If the demo call fails, this module reports
 *     the failure. It does not retry, and it does not try another host.
 *   - A caller cannot pass a "use live" flag: no exported function accepts one,
 *     and no branch in this file reads one.
 *
 * Credentials (all optional — absence is a reportable state, never an error):
 *   TRADEGUARD_BITGET_DEMO_API_KEY
 *   TRADEGUARD_BITGET_DEMO_API_SECRET
 *   TRADEGUARD_BITGET_DEMO_PASSPHRASE
 *   TRADEGUARD_BITGET_DEMO_API_BASE   (defaults to Bitget's demo host)
 *
 * No credential value is ever logged, echoed, or included in a returned error.
 * The only thing exposed about credentials is WHICH names are missing.
 */

const DEFAULT_DEMO_BASE = 'https://api.bitget.com';
const DEMO_PATH_PREFIX = '/api/v2/spot';
const REQUEST_TIMEOUT_MS = 10000;

/** The env var names this provider reads. Exported so the route can report
 *  exactly what is missing without hardcoding the list twice. */
export const DEMO_CREDENTIAL_ENV = Object.freeze({
  key: 'TRADEGUARD_BITGET_DEMO_API_KEY',
  secret: 'TRADEGUARD_BITGET_DEMO_API_SECRET',
  passphrase: 'TRADEGUARD_BITGET_DEMO_PASSPHRASE',
  base: 'TRADEGUARD_BITGET_DEMO_API_BASE',
});

/**
 * Reads the demo credentials from the environment.
 *
 * Deliberately returns NAMES of missing variables rather than any value, so the
 * UI can say exactly what to configure without a secret ever entering a
 * response, a log line or a payload.
 */
export function readDemoCredentials(env = process.env) {
  const source = env && typeof env === 'object' ? env : {};
  const key = typeof source[DEMO_CREDENTIAL_ENV.key] === 'string' ? source[DEMO_CREDENTIAL_ENV.key].trim() : '';
  const secret = typeof source[DEMO_CREDENTIAL_ENV.secret] === 'string' ? source[DEMO_CREDENTIAL_ENV.secret].trim() : '';
  const passphrase =
    typeof source[DEMO_CREDENTIAL_ENV.passphrase] === 'string' ? source[DEMO_CREDENTIAL_ENV.passphrase].trim() : '';
  const baseRaw =
    typeof source[DEMO_CREDENTIAL_ENV.base] === 'string' ? source[DEMO_CREDENTIAL_ENV.base].trim() : '';

  const base = (baseRaw || DEFAULT_DEMO_BASE).replace(/\/+$/, '');

  const missing = [
    key ? null : DEMO_CREDENTIAL_ENV.key,
    secret ? null : DEMO_CREDENTIAL_ENV.secret,
    passphrase ? null : DEMO_CREDENTIAL_ENV.passphrase,
  ].filter(Boolean);

  return {
    configured: missing.length === 0,
    missing,
    // The values are intentionally NOT part of the returned object's public
    // surface: nothing downstream should be able to stringify one by accident.
    // They are attached last and only consumed inside submitDemoOrder.
    _key: key,
    _secret: secret,
    _passphrase: passphrase,
    base,
  };
}

/**
 * Resolves a TradeGuard asset to a Bitget spot symbol.
 *
 * Reuses the SAME mapping the market-data provider uses (rNVDA -> RNVDAUSDT) so
 * the symbol the trader saw prices for and the symbol an order is submitted for
 * can never disagree.
 */
export function demoSymbol(asset) {
  const a = String(asset || '').trim().toUpperCase();
  if (!a) return '';
  if (a.endsWith('USDT') || a.endsWith('USDC') || a.endsWith('USD')) return a;
  return `${a}USDT`;
}

/**
 * Bitget demo orders are documented as carrying a `paperTrading` marker on the
 * demo host. We send it explicitly and unconditionally — it is never derived
 * from a flag, never optional, and never omitted.
 */
function buildBody(order) {
  return {
    symbol: order.symbol,
    side: order.side,
    orderType: order.orderType,
    // force: 'normal' — a plain spot order. No margin, no leverage.
    force: 'normal',
    price: order.orderType === 'limit' ? String(order.price) : undefined,
    size: String(order.quantity),
    // The demo marker. Sent on every order; there is no branch that omits it.
    paperTrading: '1',
  };
}

/**
 * Signing is provider-specific and lives here, behind the boundary.
 *
 * Uses the Web Crypto API available on Node 18+ globally. Falls back to an
 * explicit unavailable result rather than throwing if crypto is missing.
 */
async function sign(timestamp, method, requestPath, body, secretKey) {
  const payload = `${timestamp}${method.toUpperCase()}${requestPath}${body}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secretKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return bufferToBase64(signature);
}

function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/**
 * Submits ONE order to the Bitget DEMO environment.
 *
 * @param {object} order          the validated TradeGuard order intent
 * @param {object} [options]
 * @param {function} [options.fetchImpl] injectable fetch (tests never hit the network)
 * @param {object}   [options.env]       injectable env (tests never read real secrets)
 * @param {Date}     [options.now]       injectable clock
 *
 * @returns {Promise<{ ok: boolean, status: string, orderId: string|null,
 *                     clientOrderId: string|null, symbol: string|null,
 *                     side: string|null, quantity: string|null, price: string|null,
 *                     orderType: string|null, rawStatus: string|null,
 *                     timestamp: string|null, message: string|null,
 *                     errorCode: string|null, environment: string }>}
 *
 * Never throws. Every failure mode is a returned shape.
 */
export async function submitDemoOrder(order, options = {}) {
  const fetchImpl = typeof options.fetchImpl === 'function' ? options.fetchImpl : globalThis.fetch;
  const creds = readDemoCredentials(options.env);
  const environment = 'demo';

  // --- 1. Credentials -----------------------------------------------------
  // Not configured is a reportable state, NOT an error and NOT a fake success.
  if (!creds.configured) {
    return {
      ok: false,
      kind: 'not-configured',
      environment,
      message:
        'Bitget Demo credentials are not configured. Set ' +
        creds.missing.join(', ') +
        ' in your environment to enable paper execution.',
      missingCredentials: creds.missing,
      orderId: null,
      clientOrderId: null,
      symbol: order?.symbol ?? null,
      side: order?.side ?? null,
      quantity: order?.quantity != null ? String(order.quantity) : null,
      price: order?.price != null ? String(order.price) : null,
      orderType: order?.orderType ?? null,
      rawStatus: null,
      timestamp: null,
      errorCode: null,
    };
  }

  if (typeof fetchImpl !== 'function') {
    return {
      ok: false,
      kind: 'network',
      environment,
      message: 'No HTTP client is available, so the order could not be sent to Bitget Demo.',
      orderId: null,
      clientOrderId: null,
      symbol: order?.symbol ?? null,
      side: order?.side ?? null,
      quantity: order?.quantity != null ? String(order.quantity) : null,
      price: order?.price != null ? String(order.price) : null,
      orderType: order?.orderType ?? null,
      rawStatus: null,
      timestamp: null,
      errorCode: null,
    };
  }

  const requestPath = `${DEMO_PATH_PREFIX}/trade/place-order`;
  const bodyObj = buildBody(order);
  // Undefined keys are dropped by JSON.stringify, so `price` vanishes for
  // market orders rather than being sent as "undefined".
  const body = JSON.stringify(bodyObj);
  const timestamp = String(Date.now());

  let signature;
  try {
    signature = await sign(timestamp, 'POST', requestPath, body, creds._secret);
  } catch (e) {
    return {
      ok: false,
      kind: 'network',
      environment,
      message: `The order could not be signed, so nothing was sent to Bitget Demo: ${e?.message || e}`,
      orderId: null,
      clientOrderId: null,
      symbol: order?.symbol ?? null,
      side: order?.side ?? null,
      quantity: null,
      price: null,
      orderType: order?.orderType ?? null,
      rawStatus: null,
      timestamp: null,
      errorCode: null,
    };
  }

  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS) : null;

  try {
    const response = await fetchImpl(`${creds.base}${requestPath}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ACCESS_KEY: creds._key,
        ACCESS_SIGN: signature,
        ACCESS_TIMESTAMP: timestamp,
        ACCESS_PASSPHRASE: creds._passphrase,
        locale: 'en-US',
      },
      body,
      ...(controller ? { signal: controller.signal } : {}),
    });

    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    // --- 2. Transport-level failure --------------------------------------
    if (!response.ok) {
      return {
        ok: false,
        kind: 'rejected',
        environment,
        message:
          json?.msg ||
          json?.message ||
          `Bitget Demo rejected the request with HTTP ${response.status}.`,
        errorCode: json?.code != null ? String(json.code) : String(response.status),
        orderId: null,
        clientOrderId: null,
        symbol: order?.symbol ?? null,
        side: order?.side ?? null,
        quantity: order?.quantity != null ? String(order.quantity) : null,
        price: order?.price != null ? String(order.price) : null,
        orderType: order?.orderType ?? null,
        rawStatus: null,
        timestamp: null,
      };
    }

    // --- 3. Bitget's own non-zero code -----------------------------------
    // A 200 with code !== '00000' is a REJECTION, not a submission. Bitget's
    // REST contract reports business errors this way.
    const code = json?.code != null ? String(json.code) : null;
    if (code && code !== '00000') {
      return {
        ok: false,
        kind: 'rejected',
        environment,
        message: json?.msg || json?.message || `Bitget Demo rejected the order (code ${code}).`,
        errorCode: code,
        orderId: null,
        clientOrderId: null,
        symbol: order?.symbol ?? null,
        side: order?.side ?? null,
        quantity: order?.quantity != null ? String(order.quantity) : null,
        price: order?.price != null ? String(order.price) : null,
        orderType: order?.orderType ?? null,
        rawStatus: null,
        timestamp: null,
      };
    }

    // --- 4. Success: only ever from Bitget's own data --------------------
    const data = json?.data && typeof json.data === 'object' ? json.data : null;
    const orderId = data?.orderId != null ? String(data.orderId) : null;

    // No order ID means Bitget did not confirm an order, so this is NOT a
    // submission — claiming one would be fabricating the provider's answer.
    if (!orderId) {
      return {
        ok: false,
        kind: 'unconfirmed',
        environment,
        message:
          'Bitget Demo returned a success response with no order ID, so no order can be confirmed as submitted.',
        errorCode: code,
        orderId: null,
        clientOrderId: data?.clientOid != null ? String(data.clientOid) : null,
        symbol: order?.symbol ?? null,
        side: order?.side ?? null,
        quantity: order?.quantity != null ? String(order.quantity) : null,
        price: order?.price != null ? String(order.price) : null,
        orderType: order?.orderType ?? null,
        rawStatus: null,
        timestamp: null,
      };
    }

    return {
      ok: true,
      kind: 'submitted',
      environment,
      message: null,
      errorCode: null,
      orderId,
      clientOrderId: data?.clientOid != null ? String(data.clientOid) : null,
      symbol: data?.symbol != null ? String(data.symbol) : order?.symbol ?? null,
      side: data?.side != null ? String(data.side) : order?.side ?? null,
      quantity: data?.size != null ? String(data.size) : order?.quantity != null ? String(order.quantity) : null,
      price: data?.price != null ? String(data.price) : order?.price != null ? String(order.price) : null,
      orderType: order?.orderType ?? null,
      rawStatus: data?.status != null ? String(data.status) : null,
      timestamp: (options.now ? new Date(options.now) : new Date()).toISOString(),
    };
  } catch (e) {
    // --- 5. Network / abort ----------------------------------------------
    return {
      ok: false,
      kind: 'network',
      environment,
      message: `The order could not be sent to Bitget Demo: ${e?.name === 'AbortError' ? 'the request timed out' : e?.message || e}`,
      orderId: null,
      clientOrderId: null,
      symbol: order?.symbol ?? null,
      side: order?.side ?? null,
      quantity: order?.quantity != null ? String(order.quantity) : null,
      price: order?.price != null ? String(order.price) : null,
      orderType: order?.orderType ?? null,
      rawStatus: null,
      timestamp: null,
      errorCode: null,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
