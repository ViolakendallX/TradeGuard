/**
 * Test kit for authenticated route tests.
 *
 * WHY THIS EXISTS
 * Route tests used to call `/api/journal` with no credential, because there was
 * no credential. Now every Trade Memory route requires a session, so a route test
 * has to sign in first — and the most honest way to do that is the way a browser
 * does it: POST to the real registration route, take the `Set-Cookie` the server
 * sends back, and hand that cookie to the next request.
 *
 * Doing it through the real routes rather than by writing a session file directly
 * means these tests also exercise the wiring — the cookie the auth route writes is
 * the cookie the auth middleware reads. A test that fabricated a session row would
 * still pass if those two ever disagreed.
 *
 * ISOLATION
 * Every kit gets its own temp directory and points BOTH auth files at it. No test
 * can read or write the developer's real accounts, and no two tests can see each
 * other's. `cleanup()` restores the environment even when a test throws.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import express from 'express';

import { USERS_FILE_ENV } from '../../services/userStore.js';
import { SESSIONS_FILE_ENV } from '../../services/sessionStore.js';

/** The env vars this kit redirects. */
const ISOLATED_ENV = [USERS_FILE_ENV, SESSIONS_FILE_ENV];

/** A password that satisfies the real minimum length, so tests never bypass it. */
export const TEST_PASSWORD = 'correct-horse-battery';

/**
 * Builds an app whose auth routes and given routers share one isolated data
 * directory, and returns handles for signing accounts up and making requests.
 *
 * @param {object} options
 * @param {Array<import('express').Router>} options.routers  routers to mount under /api
 * @param {object} [options.env]  extra environment variables to set for the test
 * @returns {Promise<object>} the kit
 */
export async function createAuthTestKit({ routers = [], env = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-auth-kit-'));
  const files = {
    users: path.join(dir, 'users.json'),
    sessions: path.join(dir, 'sessions.json'),
  };

  const restore = {};
  const applied = {
    [USERS_FILE_ENV]: files.users,
    [SESSIONS_FILE_ENV]: files.sessions,
    ...env,
  };
  for (const [key, value] of Object.entries(applied)) {
    restore[key] = process.env[key];
    process.env[key] = value;
  }

  // Imported lazily so the env vars above are already in place when the routers
  // resolve the paths they write to.
  const { default: authRouter } = await import('../../routes/auth.js');

  const app = express();
  app.use(express.json({ limit: '128kb' }));
  app.use('/api', authRouter);
  for (const router of routers) app.use('/api', router);

  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  /** Restores the environment and stops the server. Safe to call twice. */
  let closed = false;
  function cleanup() {
    if (closed) return;
    closed = true;
    server.close();
    for (const [key, value] of Object.entries(restore)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  /** Reads `Set-Cookie` off a response and returns the `name=value` pair. */
  function cookieFrom(response) {
    // `getSetCookie()` is the only way to read more than one Set-Cookie header.
    // It is present on Node's fetch; the fallback keeps this working if not.
    const raw = typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : [response.headers.get('set-cookie')].filter(Boolean);
    const first = raw[0];
    if (!first) return null;
    return first.split(';')[0];
  }

  const kit = {
    base,
    dir,
    files,
    cleanup,

    /** Raw fetch, so a test can send anything it likes. */
    fetch: (url, init) => fetch(`${base}${url}`, init),

    /** POSTs JSON. */
    async post(url, body, { cookie = null } = {}) {
      const headers = { 'Content-Type': 'application/json' };
      if (cookie) headers.Cookie = cookie;
      return fetch(`${base}${url}`, { method: 'POST', headers, body: JSON.stringify(body ?? {}) });
    },

    /** GETs, optionally as a signed-in account. */
    async get(url, { cookie = null } = {}) {
      const headers = {};
      if (cookie) headers.Cookie = cookie;
      return fetch(`${base}${url}`, { method: 'GET', headers });
    },

    /**
     * Creates an account through the real registration route and returns the
     * session cookie the browser would have kept.
     */
    async register({
      name = 'Test Trader',
      email = 'trader@example.com',
      password = TEST_PASSWORD,
    } = {}) {
      const response = await kit.post('/api/auth/register', { name, email, password });
      const body = await response.json();
      return {
        status: response.status,
        body,
        user: body.user,
        cookie: cookieFrom(response),
      };
    },

    /** Registers and asserts the result, so a setup failure is never silent. */
    async signedInUser(options = {}) {
      const result = await kit.register(options);
      if (result.status !== 201 || !result.cookie) {
        throw new Error(
          `test kit could not sign a user in: ${result.status} ${JSON.stringify(result.body)}`
        );
      }
      return { cookie: result.cookie, user: result.user };
    },
  };

  return kit;
}
