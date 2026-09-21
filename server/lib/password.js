/**
 * Password hashing.
 *
 * WHAT IS STORED
 * A scrypt derivation, never the password. The stored string is self-describing:
 *
 *     scrypt$<N>$<r>$<p>$<saltBase64>$<hashBase64>
 *
 * Carrying the parameters in the value is what makes a future cost increase a
 * per-user upgrade rather than a flag day: an old hash still verifies against
 * the parameters it was created with, and can be re-hashed on next sign-in.
 *
 * WHY scrypt
 * It is in Node's standard library (`node:crypto`), so this stays dependency-free
 * like the rest of the backend, and it is memory-hard — the property that makes
 * GPU-accelerated cracking expensive. The cost parameters below are the Node
 * defaults raised to a 64 MiB working set, which is a deliberate floor, not a
 * tuning knob: lowering them silently weakens every stored password.
 *
 * TIMING
 * Verification is a constant-time comparison of the derived keys, and an unknown
 * account is verified against a dummy hash (see `verifyPassword`'s caller in
 * `server/routes/auth.js`) so that "no such user" and "wrong password" take the
 * same time. Without that, response latency answers the question the error
 * message deliberately refuses to.
 */

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/** Identifier at the head of every stored hash. */
export const PASSWORD_SCHEME = 'scrypt';

/** Cost parameters. `N` is the CPU/memory cost, `r` the block size, `p` the parallelism. */
export const SCRYPT_PARAMS = Object.freeze({ N: 16384, r: 8, p: 1 });

/** Length of the derived key, in bytes. */
export const KEY_LENGTH = 64;

/** Length of the per-user salt, in bytes. */
export const SALT_LENGTH = 16;

/** `maxmem` must be raised above the 32 MiB default for N=16384, r=8 (needs 128*N*r). */
const MAX_MEM = 128 * SCRYPT_PARAMS.N * SCRYPT_PARAMS.r * 2;

/**
 * Derives a key from a password and a salt.
 * Exported so a test can prove the derivation is salted — two users with the same
 * password must not share a hash.
 */
export function derive(password, salt, params = SCRYPT_PARAMS) {
  return scryptSync(String(password), salt, KEY_LENGTH, {
    N: params.N,
    r: params.r,
    p: params.p,
    maxmem: MAX_MEM,
  });
}

/**
 * Hashes a password for storage.
 *
 * @param {string} password the plaintext, used here and never retained
 * @returns {string} the self-describing stored value
 */
export function hashPassword(password) {
  const salt = randomBytes(SALT_LENGTH);
  const { N, r, p } = SCRYPT_PARAMS;
  const key = derive(password, salt, SCRYPT_PARAMS);
  return [
    PASSWORD_SCHEME,
    N,
    r,
    p,
    salt.toString('base64'),
    key.toString('base64'),
  ].join('$');
}

/** Parses a stored value. Returns null when it is not a hash this build understands. */
export function parseStored(stored) {
  if (typeof stored !== 'string') return null;
  const parts = stored.split('$');
  if (parts.length !== 6) return null;

  const [scheme, n, r, p, saltB64, hashB64] = parts;
  if (scheme !== PASSWORD_SCHEME) return null;

  const N = Number(n);
  const rr = Number(r);
  const pp = Number(p);
  if (!Number.isInteger(N) || !Number.isInteger(rr) || !Number.isInteger(pp)) return null;
  if (N <= 1 || rr <= 0 || pp <= 0) return null;

  let salt;
  let hash;
  try {
    salt = Buffer.from(saltB64, 'base64');
    hash = Buffer.from(hashB64, 'base64');
  } catch {
    return null;
  }
  if (salt.length === 0 || hash.length === 0) return null;

  return { N, r: rr, p: pp, salt, hash };
}

/**
 * Verifies a password against a stored value.
 *
 * Returns false — never throws — for a malformed or absent stored value, so a
 * hand-edited user file degrades to "cannot sign in" rather than a 500.
 *
 * @param {string} password
 * @param {string} stored
 * @returns {boolean}
 */
export function verifyPassword(password, stored) {
  const parsed = parseStored(stored);
  if (!parsed) return false;

  let candidate;
  try {
    candidate = derive(password, parsed.salt, { N: parsed.N, r: parsed.r, p: parsed.p });
  } catch {
    return false;
  }

  // Lengths can differ only for a corrupt value; timingSafeEqual throws on a
  // length mismatch, so that case is answered as a plain false.
  if (candidate.length !== parsed.hash.length) return false;

  return timingSafeEqual(candidate, parsed.hash);
}

/**
 * Burns the same work as a real verification against a throwaway hash.
 *
 * Called when no account matches the submitted email, so that the unknown-account
 * path costs what the wrong-password path costs. The result is discarded.
 */
const DUMMY = hashPassword('tradeguard-dummy-password-for-timing-equalisation');

export function burnPasswordWork(password) {
  verifyPassword(password, DUMMY);
  return false;
}
