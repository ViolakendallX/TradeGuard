/**
 * Authentication routes.
 *
 *   POST /api/auth/register  — create an account, then sign in as it.
 *   POST /api/auth/login     — check a credential pair, then open a session.
 *   POST /api/auth/logout    — destroy the session and clear the cookie.
 *   GET  /api/auth/me        — report the current session, if any.
 *
 * WHAT IS AND IS NOT RETURNED
 * The response body carries `{ id, name, email, createdAt }` and nothing else.
 * The password hash is never serialised, never logged and never compared in a
 * place that could echo it. `publicUser()` builds that shape by NAMING the safe
 * fields, so a field added to the user record later is private until someone
 * deliberately adds it here.
 *
 * WHY THE COOKIE AND NOT A TOKEN IN THE BODY
 * A token in the response body has to be stored somewhere the page can read it,
 * and the only places available are ones a script can read too. An HttpOnly
 * cookie is sent by the browser and is invisible to JavaScript. The frontend
 * therefore never learns the session token — it only ever asks "who am I?".
 *
 * COOKIE SECURITY SETTINGS
 *   HttpOnly   always — the token is not reachable from page scripts.
 *   SameSite   Lax    — the cookie is not attached to cross-site POSTs, which is
 *                       what stops another origin driving an authenticated write
 *                       through the trader's browser.
 *   Secure     production only. On plain http (this is the local dev setup) a
 *              Secure cookie is discarded by the browser, so setting it
 *              unconditionally would mean "sign-in silently does nothing" in
 *              development. It is derived from NODE_ENV, and can be forced with
 *              TRADEGUARD_COOKIE_SECURE=true when running behind TLS.
 *   Max-Age    matches the session's own lifetime.
 *
 * FAILURE COPY
 * Sign-in failure returns ONE message for every cause — unknown email, wrong
 * password, malformed input — because a distinct "no account with that email"
 * turns the sign-in form into an account-enumeration oracle. The status code is
 * 401 either way.
 */

import { Router } from 'express';

import {
  createUserStore,
  publicUser,
  validateRegistration,
  EMAIL_PATTERN,
} from '../services/userStore.js';
import { createSessionStore, SESSION_TTL_MS, SESSION_COOKIE } from '../services/sessionStore.js';
import { serializeCookie, clearCookie, parseCookies } from '../lib/cookies.js';
import { requireAuth, optionalAuth } from '../middleware/requireAuth.js';

const router = Router();

/** True when the deployment is served over TLS and the cookie may be locked to it. */
function cookieIsSecure() {
  const forced = String(process.env.TRADEGUARD_COOKIE_SECURE ?? '').toLowerCase();
  if (forced === 'true') return true;
  if (forced === 'false') return false;
  return process.env.NODE_ENV === 'production';
}

/** The attributes every session cookie is written with. */
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'Lax',
    secure: cookieIsSecure(),
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  };
}

/** The one message a failed sign-in ever carries. */
export const INVALID_CREDENTIALS_MESSAGE = 'Email or password is incorrect.';

/** The one message a duplicate registration ever carries. */
export const DUPLICATE_ACCOUNT_MESSAGE = 'An account with that email address already exists.';

function users() {
  return createUserStore();
}

function sessions() {
  return createSessionStore();
}

/** Opens a session and writes the cookie. Returns the raw token only to the caller. */
function openSession(res, userId) {
  const opened = sessions().create(userId);
  if (!opened.ok) return { ok: false, problem: opened.problem };

  res.append(
    'Set-Cookie',
    serializeCookie(SESSION_COOKIE, opened.token, sessionCookieOptions())
  );
  return { ok: true, problem: null };
}

/** The static contract, returned with every auth response. */
export function authMeta() {
  return {
    mechanism: 'server-side-session',
    transport: 'http-only-cookie',
    cookie: SESSION_COOKIE,
    tokenInLocalStorage: false,
    tokenInResponseBody: false,
    hashing: 'scrypt',
    store: 'local-json-file',
    sessionTtlSeconds: Math.floor(SESSION_TTL_MS / 1000),
    cookieSecure: cookieIsSecure(),
    cookieSameSite: 'Lax',
    note:
      'The session token is returned to the browser only as an HttpOnly cookie and is stored ' +
      'server-side as a SHA-256 digest. The frontend never receives it.',
  };
}

/**
 * POST /api/auth/register
 *
 * Creates the account and signs the new user in, in one step — which is what
 * "create an account and land in the product" means. The account is committed
 * before the session is opened, so a failure to open a session leaves an account
 * the trader can sign in to rather than a half-registered state.
 */
router.post('/auth/register', (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};

  const errors = validateRegistration(body);
  if (Object.keys(errors).length > 0) {
    return res.status(400).json({
      status: 'invalid',
      message: 'Check the highlighted fields and try again.',
      errors,
      user: null,
      ...authMeta(),
    });
  }

  const created = users().create({
    name: body.name,
    email: body.email,
    password: body.password,
  });

  if (!created.ok && created.conflict) {
    return res.status(409).json({
      status: 'duplicate',
      message: DUPLICATE_ACCOUNT_MESSAGE,
      errors: { email: DUPLICATE_ACCOUNT_MESSAGE },
      user: null,
      ...authMeta(),
    });
  }

  if (!created.ok) {
    return res.status(200).json({
      status: 'unavailable',
      message: created.problem || 'The account could not be created.',
      errors: created.errors || undefined,
      user: null,
      ...authMeta(),
    });
  }

  const opened = openSession(res, created.user.id);
  if (!opened.ok) {
    // The account exists and the password is correct — the trader can sign in.
    return res.status(200).json({
      status: 'created-no-session',
      message:
        'Your account was created, but a session could not be opened. Sign in to continue.',
      user: publicUser(created.user),
      ...authMeta(),
    });
  }

  return res.status(201).json({
    status: 'ok',
    created: true,
    message: 'Your TradeGuard account was created.',
    user: publicUser(created.user),
    ...authMeta(),
  });
});

/**
 * POST /api/auth/login
 *
 * One failure response for every cause. The account store performs the same
 * scrypt work whether or not the email matches, so the two paths cannot be told
 * apart by how long they take either.
 */
router.post('/auth/login', (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  // A malformed request is answered with the same message and the same status as
  // a wrong password. It is not the server's job to help someone probe.
  if (!email || !password || !EMAIL_PATTERN.test(email)) {
    return res.status(401).json({
      status: 'invalid-credentials',
      message: INVALID_CREDENTIALS_MESSAGE,
      user: null,
      ...authMeta(),
    });
  }

  const checked = users().authenticate(email, password);

  if (!checked.ok) {
    return res.status(200).json({
      status: 'unavailable',
      message: checked.problem || 'Sign-in could not be completed.',
      user: null,
      ...authMeta(),
    });
  }

  if (!checked.user) {
    return res.status(401).json({
      status: 'invalid-credentials',
      message: INVALID_CREDENTIALS_MESSAGE,
      user: null,
      ...authMeta(),
    });
  }

  const opened = openSession(res, checked.user.id);
  if (!opened.ok) {
    return res.status(200).json({
      status: 'no-session',
      message: 'Your credentials were accepted, but a session could not be opened. Try again.',
      user: null,
      ...authMeta(),
    });
  }

  return res.status(200).json({
    status: 'ok',
    message: 'Signed in.',
    user: publicUser(checked.user),
    ...authMeta(),
  });
});

/**
 * POST /api/auth/logout
 *
 * Always 200, whether or not there was a session — a logout that reports failure
 * because it found nothing to destroy would leave the trader unable to tell
 * "already signed out" from "still signed in".
 *
 * The cookie is cleared with the SAME attributes it was set with; otherwise the
 * browser treats it as a different cookie and the original survives.
 */
router.post('/auth/logout', (req, res) => {
  const token = parseCookies(req?.headers?.cookie)[SESSION_COOKIE];

  if (token) sessions().destroy(token);

  const { maxAge: _maxAge, ...clearOptions } = sessionCookieOptions();
  res.append('Set-Cookie', clearCookie(SESSION_COOKIE, clearOptions));

  return res.status(200).json({
    status: 'ok',
    authenticated: false,
    message: 'Signed out.',
    user: null,
    ...authMeta(),
  });
});

/**
 * GET /api/auth/me
 *
 * Reports the session. This is an INSPECTION endpoint, not a protected resource:
 * "nobody is signed in" is a valid answer to the question it asks, so it is a 200
 * with `authenticated: false` rather than a 401. That keeps the browser console
 * clean on the sign-in page and lets the frontend ask on every load without
 * special-casing an error.
 */
router.get('/auth/me', optionalAuth, (req, res) => {
  const user = req.user;
  return res.status(200).json({
    status: 'ok',
    authenticated: Boolean(user),
    user: user ? publicUser(user) : null,
    ...authMeta(),
  });
});

/**
 * GET /api/auth/session
 *
 * A convenience alias used by nothing but the verification scripts, so they can
 * assert the protected-route behaviour of `/auth/me`'s sibling without inventing
 * a protected resource. It requires a session, and exists to prove the middleware.
 */
router.get('/auth/session', requireAuth, (req, res) => {
  res.status(200).json({ status: 'ok', authenticated: true, user: publicUser(req.user) });
});

export default router;
