/**
 * TradeGuard sessions.
 *
 * HOW A SESSION WORKS HERE
 *   1. Sign-in mints 32 random bytes and returns them to the browser in an
 *      HttpOnly cookie. That value is the session token, and it is the ONLY copy
 *      of it that exists in readable form.
 *   2. What is stored server-side is `sha256(token)` — never the token itself.
 *      A copy of `sessions.json` therefore cannot be replayed as a login, and the
 *      file is safe to read while debugging.
 *   3. A protected request hashes the cookie value and looks that up. There is no
 *      signing secret to leak and no JWT to keep short-lived, because the server
 *      is the only holder of the truth.
 *
 * WHY NOT localStorage
 * Anything in localStorage is readable by any script on the page. An HttpOnly
 * cookie is not. That is the whole argument, and it is why the frontend never
 * receives the token — it only ever sees the resulting session state.
 *
 * EXPIRY
 * Absolute lifetime of 7 days, plus a sliding window that extends the cookie on
 * genuine use — but at most once per `TOUCH_INTERVAL_MS`, so a busy tab does not
 * rewrite the file on every request. An expired session is treated as absent and
 * deleted on sight.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.resolve(HERE, '..');

/** The sessions file. Gitignored, like the journal and the accounts file. */
export const DEFAULT_SESSIONS_FILE = path.join(SERVER_ROOT, 'data', 'sessions.json');
export const SESSIONS_FILE_ENV = 'TRADEGUARD_SESSIONS_FILE';

export const SESSIONS_VERSION = 1;

/** The cookie the session token travels in. */
export const SESSION_COOKIE = 'tg_session';

/** How long a session lives from its last extension. */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** The minimum gap between two extensions of the same session. */
export const TOUCH_INTERVAL_MS = 60 * 60 * 1000;

/** Token length in bytes. 32 bytes = 256 bits of entropy. */
export const TOKEN_BYTES = 32;

const isObj = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const txt = (v) => (typeof v === 'string' ? v.trim() : '');

/**
 * The stored form of a token.
 * Plain sha256 is right here (unlike for passwords): the input is 256 bits of
 * randomness, so there is no dictionary to attack and no need for a slow KDF —
 * and a slow KDF on every authenticated request would be a self-inflicted
 * denial of service.
 */
export function hashToken(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

/** True when the token has the shape this build mints. */
export function isWellFormedToken(token) {
  if (typeof token !== 'string') return false;
  // base64url of 32 bytes, with no padding.
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function normalizeSession(input) {
  const src = isObj(input) ? input : {};
  const tokenHash = txt(src.tokenHash);
  const userId = txt(src.userId);
  if (!tokenHash || !userId) return null;

  const createdAt = txt(src.createdAt) || new Date().toISOString();
  const expiresAt = txt(src.expiresAt) || new Date(Date.now() + SESSION_TTL_MS).toISOString();

  return {
    tokenHash,
    userId,
    createdAt,
    expiresAt,
    lastSeenAt: txt(src.lastSeenAt) || createdAt,
  };
}

/** True when the stored expiry has passed. */
export function isExpired(session, now = Date.now()) {
  const at = Date.parse(session?.expiresAt ?? '');
  if (!Number.isFinite(at)) return true;
  return at <= now;
}

/**
 * Creates a session store bound to one file.
 * @param {{ filePath?: string }} [options]
 */
export function createSessionStore(options = {}) {
  const filePath = txt(options.filePath) || txt(process.env[SESSIONS_FILE_ENV]) || DEFAULT_SESSIONS_FILE;

  function read() {
    let text;
    try {
      text = fs.readFileSync(filePath, 'utf8');
    } catch (e) {
      if (e?.code === 'ENOENT') return { ok: true, exists: false, sessions: [], problem: null };
      return { ok: false, exists: true, sessions: [], problem: `The sessions file could not be read: ${e?.message || e}` };
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, exists: true, sessions: [], problem: 'The sessions file is not valid JSON.' };
    }

    const list = Array.isArray(parsed)
      ? parsed
      : isObj(parsed) && Array.isArray(parsed.sessions)
      ? parsed.sessions
      : null;

    if (!list) return { ok: false, exists: true, sessions: [], problem: 'The sessions file does not contain a sessions list.' };

    const sessions = [];
    for (const entry of list) {
      const normalised = normalizeSession(entry);
      if (normalised) sessions.push(normalised);
    }
    return { ok: true, exists: true, sessions, problem: null };
  }

  function write(sessions) {
    const payload = JSON.stringify(
      { version: SESSIONS_VERSION, updatedAt: new Date().toISOString(), sessions },
      null,
      2
    );

    const dir = path.dirname(filePath);
    const tmp = `${filePath}.${process.pid}.tmp`;

    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(tmp, payload, { encoding: 'utf8', mode: 0o600 });
      fs.renameSync(tmp, filePath);
      return { ok: true, problem: null };
    } catch (e) {
      try {
        fs.rmSync(tmp, { force: true });
      } catch {
        /* best-effort cleanup */
      }
      return { ok: false, problem: `The sessions file could not be written: ${e?.message || e}` };
    }
  }

  /**
   * Mints a session for a user.
   *
   * @returns {{ ok: boolean, token: string|null, session: object|null, problem: string|null }}
   *   `token` is the only time the raw value exists. It goes into the cookie and
   *   is never persisted.
   */
  function create(userId, now = new Date()) {
    const id = txt(userId);
    if (!id) return { ok: false, token: null, session: null, problem: 'A user id is required to open a session.' };

    const loaded = read();
    if (!loaded.ok) return { ok: false, token: null, session: null, problem: loaded.problem };

    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    const stamp = now.toISOString();

    const session = {
      tokenHash: hashToken(token),
      userId: id,
      createdAt: stamp,
      lastSeenAt: stamp,
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
    };

    // Expired rows are dropped on every write, so the file cannot grow forever.
    const kept = loaded.sessions.filter((s) => !isExpired(s, now.getTime()));
    const written = write([...kept, session]);
    if (!written.ok) return { ok: false, token: null, session: null, problem: written.problem };

    return { ok: true, token, session, problem: null };
  }

  /**
   * Resolves a raw token to its session, extending it when it is due.
   *
   * Returns `{ ok: true, session: null }` for an unknown, malformed or expired
   * token — all three are simply "not signed in", and distinguishing them in a
   * response would tell an attacker which guesses were closer.
   */
  function resolve(token, now = new Date()) {
    if (!isWellFormedToken(token)) return { ok: true, session: null, problem: null };

    const loaded = read();
    if (!loaded.ok) return { ok: false, session: null, problem: loaded.problem };

    const wanted = hashToken(token);
    const found = loaded.sessions.find((s) => s.tokenHash === wanted) ?? null;

    if (!found) return { ok: true, session: null, problem: null };

    if (isExpired(found, now.getTime())) {
      // Expired: remove it rather than leave it to be tried again.
      write(loaded.sessions.filter((s) => s.tokenHash !== wanted));
      return { ok: true, session: null, problem: null };
    }

    // Sliding expiry, throttled: an active trader stays signed in, but the file
    // is not rewritten on every request.
    const sinceTouch = now.getTime() - Date.parse(found.lastSeenAt || found.createdAt);
    if (Number.isFinite(sinceTouch) && sinceTouch > TOUCH_INTERVAL_MS) {
      const extended = {
        ...found,
        lastSeenAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
      };
      write(loaded.sessions.map((s) => (s.tokenHash === wanted ? extended : s)));
      return { ok: true, session: extended, problem: null };
    }

    return { ok: true, session: found, problem: null };
  }

  /** Destroys one session. Idempotent: destroying an unknown token is fine. */
  function destroy(token) {
    if (!isWellFormedToken(token)) return { ok: true, removed: false, problem: null };

    const loaded = read();
    if (!loaded.ok) return { ok: false, removed: false, problem: loaded.problem };

    const wanted = hashToken(token);
    const kept = loaded.sessions.filter((s) => s.tokenHash !== wanted);
    if (kept.length === loaded.sessions.length) return { ok: true, removed: false, problem: null };

    const written = write(kept);
    return written.ok ? { ok: true, removed: true, problem: null } : { ok: false, removed: false, problem: written.problem };
  }

  /** Destroys every session for one user. Used when an account is removed or reset. */
  function destroyAllForUser(userId) {
    const loaded = read();
    if (!loaded.ok) return { ok: false, removed: 0, problem: loaded.problem };

    const wanted = txt(userId);
    const kept = loaded.sessions.filter((s) => s.userId !== wanted);
    const removed = loaded.sessions.length - kept.length;
    if (removed === 0) return { ok: true, removed: 0, problem: null };

    const written = write(kept);
    return written.ok ? { ok: true, removed, problem: null } : { ok: false, removed: 0, problem: written.problem };
  }

  /** Drops expired rows. Returns how many were removed. */
  function purgeExpired(now = new Date()) {
    const loaded = read();
    if (!loaded.ok) return { ok: false, removed: 0, problem: loaded.problem };

    const kept = loaded.sessions.filter((s) => !isExpired(s, now.getTime()));
    const removed = loaded.sessions.length - kept.length;
    if (removed === 0) return { ok: true, removed: 0, problem: null };

    const written = write(kept);
    return written.ok ? { ok: true, removed, problem: null } : { ok: false, removed: 0, problem: written.problem };
  }

  /** How many live sessions exist. Reporting only — never exposes a token. */
  function countActive(now = new Date()) {
    const loaded = read();
    if (!loaded.ok) return 0;
    return loaded.sessions.filter((s) => !isExpired(s, now.getTime())).length;
  }

  return { filePath, read, write, create, resolve, destroy, destroyAllForUser, purgeExpired, countActive };
}
