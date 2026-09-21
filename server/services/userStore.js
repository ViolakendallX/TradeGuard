/**
 * TradeGuard accounts.
 *
 * A user record carries exactly what the product needs and nothing else:
 *
 *   { id, name, email, emailNormalized, passwordHash, createdAt }
 *
 * `email` keeps what the trader typed (so the app can greet them the way they
 * wrote it); `emailNormalized` is the trimmed, lower-cased form, and it is the
 * ONLY field an account is ever looked up by. Two accounts can therefore not be
 * created for `Sam@Example.com` and `sam@example.com`.
 *
 * STORAGE
 * One JSON file, `server/data/users.json` by default, written atomically (temp
 * file + rename) exactly like the Trade Memory journal — same architecture, no
 * database, no migration framework. Override with `TRADEGUARD_USERS_FILE`, which
 * is what the tests use so they never touch real accounts.
 *
 * The file is read on every call rather than cached, for the same reason the
 * journal is: the store is small, the process is single-tenant, and a cache is
 * one more thing that can disagree with what is on disk.
 *
 * WHAT THIS MODULE WILL NOT DO
 *   - It never returns `passwordHash` from any function whose result is meant for
 *     a response. `publicUser()` is the only shape that leaves the server, and it
 *     is built by naming the three safe fields rather than by deleting the secret
 *     one — so a field added later is private until someone says otherwise.
 *   - It never logs a credential. There is no console output in this file.
 */

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { hashPassword, verifyPassword, burnPasswordWork } from '../lib/password.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.resolve(HERE, '..');

/** The users file. Gitignored, like the journal. */
export const DEFAULT_USERS_FILE = path.join(SERVER_ROOT, 'data', 'users.json');
export const USERS_FILE_ENV = 'TRADEGUARD_USERS_FILE';

/** Bumped if the file layout ever changes in a way a reader must know about. */
export const USERS_VERSION = 1;

/** Field limits, matching the frontend's own rules in `src/lib/auth.js`. */
export const NAME_MAX_LENGTH = 80;
export const EMAIL_MAX_LENGTH = 254;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** Pragmatic email shape check — the same rule the sign-up form applies. */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const isObj = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const txt = (v) => (typeof v === 'string' ? v.trim() : '');

/** The normalised form an account is looked up by: trimmed, lower-cased. */
export function normalizeEmail(value) {
  return txt(value).toLowerCase();
}

/**
 * The ONLY user shape that may leave the server.
 * Built by naming the safe fields, so a field added to the record later is
 * private by default rather than leaked by default.
 */
export function publicUser(user) {
  if (!isObj(user)) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
  };
}

/** Normalises a stored record. Returns null when it has no usable id. */
export function normalizeUser(input) {
  const src = isObj(input) ? input : {};
  const id = txt(src.id);
  if (!id) return null;

  const email = txt(src.email);
  const emailNormalized = normalizeEmail(src.emailNormalized || src.email);
  if (!emailNormalized) return null;

  const passwordHash = typeof src.passwordHash === 'string' ? src.passwordHash : '';
  if (!passwordHash) return null;

  return {
    id,
    name: txt(src.name),
    email: email || emailNormalized,
    emailNormalized,
    passwordHash,
    createdAt: txt(src.createdAt) || new Date().toISOString(),
  };
}

/**
 * Validates a registration request.
 * Returns a field -> message map, empty when the request is acceptable.
 *
 * The same rules the sign-up form applies, re-stated on the server because the
 * server is the only place they can be enforced. A client that skips its own
 * validation must still not be able to create a weak account.
 */
export function validateRegistration(body) {
  const b = isObj(body) ? body : {};
  const errors = {};

  const name = txt(b.name);
  const email = txt(b.email);
  const password = typeof b.password === 'string' ? b.password : '';
  const confirm = typeof b.confirmPassword === 'string' ? b.confirmPassword : '';

  if (!name) errors.name = 'Enter your name.';
  else if (name.length > NAME_MAX_LENGTH) errors.name = `Name must be ${NAME_MAX_LENGTH} characters or fewer.`;

  if (!email) errors.email = 'Enter your email address.';
  else if (email.length > EMAIL_MAX_LENGTH) errors.email = 'That email address is too long.';
  else if (!EMAIL_PATTERN.test(email)) errors.email = 'Enter a valid email address, for example name@example.com.';

  let passwordUsable = true;
  if (!password) {
    errors.password = 'Choose a password.';
    passwordUsable = false;
  } else if (password.length < PASSWORD_MIN_LENGTH) {
    errors.password = `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
    passwordUsable = false;
  } else if (password.length > PASSWORD_MAX_LENGTH) {
    errors.password = `Password must be ${PASSWORD_MAX_LENGTH} characters or fewer.`;
    passwordUsable = false;
  }

  // The confirmation is only judged against a password that is itself usable —
  // two messages for one problem, and the second is not the actionable one.
  if (confirm && passwordUsable && confirm !== password) {
    errors.confirmPassword = 'Passwords do not match.';
  }

  return errors;
}

/**
 * Creates a user store bound to one file.
 * Stateless between calls, so tests can point it at a temporary file.
 *
 * @param {{ filePath?: string }} [options]
 */
export function createUserStore(options = {}) {
  const filePath = txt(options.filePath) || txt(process.env[USERS_FILE_ENV]) || DEFAULT_USERS_FILE;

  /** Reads the file. Never throws: a missing file is an empty store. */
  function read() {
    let text;
    try {
      text = fs.readFileSync(filePath, 'utf8');
    } catch (e) {
      if (e?.code === 'ENOENT') return { ok: true, exists: false, users: [], problem: null };
      return { ok: false, exists: true, users: [], problem: `The accounts file could not be read: ${e?.message || e}` };
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return {
        ok: false,
        exists: true,
        users: [],
        problem: 'The accounts file is not valid JSON, so no account could be read from it.',
      };
    }

    const list = Array.isArray(parsed)
      ? parsed
      : isObj(parsed) && Array.isArray(parsed.users)
      ? parsed.users
      : null;

    if (!list) {
      return {
        ok: false,
        exists: true,
        users: [],
        problem: 'The accounts file does not contain a users list.',
      };
    }

    const users = [];
    for (const entry of list) {
      const normalised = normalizeUser(entry);
      if (normalised) users.push(normalised);
    }

    return { ok: true, exists: true, users, problem: null };
  }

  /** Atomic write: temp file + rename, so a crash cannot leave a half-file. */
  function write(users) {
    const payload = JSON.stringify(
      { version: USERS_VERSION, updatedAt: new Date().toISOString(), users },
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
      return { ok: false, problem: `The accounts file could not be written: ${e?.message || e}` };
    }
  }

  /** An account by its normalised email, or null. */
  function findByEmail(email) {
    const loaded = read();
    if (!loaded.ok) return { ok: false, user: null, problem: loaded.problem };
    const wanted = normalizeEmail(email);
    return { ok: true, user: loaded.users.find((u) => u.emailNormalized === wanted) ?? null, problem: null };
  }

  /** An account by id, or null. */
  function getById(id) {
    const loaded = read();
    if (!loaded.ok) return { ok: false, user: null, problem: loaded.problem };
    const wanted = txt(id);
    return { ok: true, user: loaded.users.find((u) => u.id === wanted) ?? null, problem: null };
  }

  /** How many accounts exist. Used to report the store's state without listing it. */
  function count() {
    const loaded = read();
    return loaded.ok ? loaded.users.length : 0;
  }

  /**
   * Creates an account.
   *
   * Uniqueness is re-checked here against the freshly read file, immediately
   * before the write, so two concurrent registrations of the same email cannot
   * both succeed on a stale read.
   *
   * @returns {{ ok: boolean, created: boolean, user: object|null, problem: string|null, conflict: boolean }}
   */
  function create({ name, email, password }) {
    const errors = validateRegistration({ name, email, password, confirmPassword: password });
    if (Object.keys(errors).length > 0) {
      return { ok: false, created: false, user: null, conflict: false, problem: 'invalid', errors };
    }

    const loaded = read();
    if (!loaded.ok) {
      return { ok: false, created: false, user: null, conflict: false, problem: loaded.problem };
    }

    const emailNormalized = normalizeEmail(email);
    if (loaded.users.some((u) => u.emailNormalized === emailNormalized)) {
      return {
        ok: false,
        created: false,
        user: null,
        conflict: true,
        problem: 'An account with that email address already exists.',
      };
    }

    const record = {
      id: randomUUID(),
      name: txt(name),
      email: txt(email),
      emailNormalized,
      // The plaintext is used here and is not retained anywhere.
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString(),
    };

    const written = write([...loaded.users, record]);
    if (!written.ok) {
      return { ok: false, created: false, user: null, conflict: false, problem: written.problem };
    }

    return { ok: true, created: true, user: record, conflict: false, problem: null };
  }

  /**
   * Checks a credential pair.
   *
   * The failure result is IDENTICAL for "no such account" and "wrong password" —
   * `{ ok: false, user: null }` with no reason attached — because the caller must
   * not be able to tell them apart, and the easiest way to guarantee that is for
   * this function to not know either.
   *
   * An unknown account still burns a full scrypt derivation, so the two paths
   * cost the same wall-clock time.
   */
  function authenticate(email, password) {
    const loaded = read();
    if (!loaded.ok) return { ok: false, user: null, problem: loaded.problem };

    const wanted = normalizeEmail(email);
    const user = loaded.users.find((u) => u.emailNormalized === wanted) ?? null;
    const secret = typeof password === 'string' ? password : '';

    if (!user) {
      burnPasswordWork(secret);
      return { ok: true, user: null, problem: null };
    }

    if (!verifyPassword(secret, user.passwordHash)) {
      return { ok: true, user: null, problem: null };
    }

    return { ok: true, user, problem: null };
  }

  /**
   * Replaces an account's password hash.
   * Used by the operator-facing reset path, not by any HTTP route.
   */
  function setPassword(id, password) {
    const loaded = read();
    if (!loaded.ok) return { ok: false, problem: loaded.problem };

    const index = loaded.users.findIndex((u) => u.id === txt(id));
    if (index === -1) return { ok: false, problem: 'No account with that id.' };

    const users = loaded.users.slice();
    users[index] = { ...users[index], passwordHash: hashPassword(password) };

    const written = write(users);
    return written.ok ? { ok: true, problem: null } : { ok: false, problem: written.problem };
  }

  return { filePath, read, write, findByEmail, getById, count, create, authenticate, setPassword };
}
