/**
 * Authentication — security and contract tests.
 *
 * These assert the properties the product promised, not the implementation:
 *
 *   - a password is never stored, and two accounts sharing a password do not
 *     share a hash
 *   - a wrong password and an unknown account are indistinguishable, in the body
 *     AND in the status code
 *   - the session token never appears in a response body
 *   - the session cookie is HttpOnly and SameSite=Lax
 *   - the server stores a digest, not the token, so the session file is not a
 *     set of usable credentials
 *   - a session survives a "restart" (a fresh read of the file) and dies on logout
 *   - an expired session is refused
 *   - a response never carries a password hash, in any shape
 *
 * Every test uses its own temporary accounts + sessions file, so nothing here
 * touches a real account and no test can see another's data.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  hashPassword,
  verifyPassword,
  parseStored,
  burnPasswordWork,
  PASSWORD_SCHEME,
  SALT_LENGTH,
} from '../lib/password.js';
import { parseCookies, serializeCookie, clearCookie } from '../lib/cookies.js';
import {
  createUserStore,
  publicUser,
  normalizeEmail,
  validateRegistration,
  PASSWORD_MIN_LENGTH,
} from '../services/userStore.js';
import {
  createSessionStore,
  hashToken,
  isWellFormedToken,
  isExpired,
  SESSION_COOKIE,
  SESSION_TTL_MS,
} from '../services/sessionStore.js';
import { createAuthTestKit, TEST_PASSWORD } from './helpers/authTestKit.js';
import authRouter from '../routes/auth.js';

/** A fresh temp directory. */
function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tg-auth-'));
}

/** Every string reachable inside a value, for "does the hash appear anywhere" checks. */
function allStrings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => allStrings(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => allStrings(v, out));
  return out;
}

// ============================================================================
// Password hashing
// ============================================================================

test('A1 — a password is never stored, only a salted scrypt derivation', () => {
  const password = 'a-very-distinctive-password';
  const stored = hashPassword(password);

  assert.equal(stored.includes(password), false, 'the plaintext must not appear in the stored value');

  const parsed = parseStored(stored);
  assert.ok(parsed, 'the stored value is self-describing');
  assert.equal(parsed.N, 16384);
  assert.equal(parsed.r, 8);
  assert.equal(parsed.p, 1);
  assert.equal(parsed.salt.length, SALT_LENGTH);
  assert.equal(stored.startsWith(`${PASSWORD_SCHEME}$`), true);

  assert.equal(verifyPassword(password, stored), true);
  assert.equal(verifyPassword('something-else', stored), false);
});

test('A2 — the same password hashes differently for two accounts (the salt is real)', () => {
  const password = 'shared-password-123';
  const first = hashPassword(password);
  const second = hashPassword(password);

  assert.notEqual(first, second, 'two hashes of one password must differ');
  assert.equal(verifyPassword(password, first), true);
  assert.equal(verifyPassword(password, second), true);
});

test('A3 — a malformed or absent stored hash verifies false rather than throwing', () => {
  for (const bad of [null, undefined, '', 'not-a-hash', 'bcrypt$1$2$3$4$5', 'scrypt$1$2$3$4$5']) {
    assert.equal(verifyPassword('anything', bad), false, `${String(bad)} must verify false`);
  }
  assert.equal(parseStored(null), null);
  assert.equal(parseStored('scrypt$0$8$1$AAAA$BBBB'), null, 'N=0 is not a usable cost');
});

test('A4 — burning password work costs a real derivation and returns false', () => {
  const started = Date.now();
  assert.equal(burnPasswordWork('anything-at-all'), false);
  // A real scrypt derivation at these parameters is tens of milliseconds; this
  // asserts the unknown-account path is not a free no-op, which is the whole
  // point of it existing.
  assert.ok(Date.now() - started >= 5, 'the unknown-account path must do real work');
});

// ============================================================================
// Cookie handling
// ============================================================================

test('A5 — the session cookie is HttpOnly, SameSite=Lax, and path-scoped', () => {
  const header = serializeCookie(SESSION_COOKIE, 'abc123', { maxAge: 60, httpOnly: true, sameSite: 'Lax' });

  assert.match(header, /^tg_session=abc123/);
  assert.match(header, /HttpOnly/);
  assert.match(header, /SameSite=Lax/);
  assert.match(header, /Path=\//);
  assert.match(header, /Max-Age=60/);
  // Secure is off in dev on purpose — see routes/auth.js. It must not be on here,
  // or the browser would silently discard the cookie over plain http.
  assert.equal(/Secure/.test(header), false);
});

test('A6 — clearing a cookie matches the attributes it was set with', () => {
  const set = serializeCookie(SESSION_COOKIE, 'abc', { httpOnly: true, sameSite: 'Lax', path: '/' });
  const cleared = clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'Lax', path: '/' });

  assert.match(cleared, /Max-Age=0/);
  for (const attribute of ['HttpOnly', 'SameSite=Lax', 'Path=/']) {
    assert.equal(
      cleared.includes(attribute),
      set.includes(attribute),
      `${attribute} must match, or the browser keeps the original cookie`
    );
  }
});

test('A7 — cookie parsing is defensive and never throws', () => {
  assert.deepEqual(Object.keys(parseCookies(undefined)), []);
  assert.deepEqual(Object.keys(parseCookies('')), []);
  assert.deepEqual(Object.keys(parseCookies('garbage-with-no-equals')), []);

  const parsed = parseCookies('a=1; tg_session=xyz; b=2');
  assert.equal(parsed.tg_session, 'xyz');

  // Later duplicates win, which is what a re-set cookie looks like on the wire.
  assert.equal(parseCookies('k=old; k=new').k, 'new');
  // A stray percent must not reject every other cookie.
  assert.equal(parseCookies('bad=%E0%A4%A; good=1').good, '1');
  assert.equal(parseCookies('q="quoted"').q, 'quoted');
});

// ============================================================================
// The account store
// ============================================================================

test('A8 — registration validates on the server, and the rules match the form', () => {
  assert.equal(Object.keys(validateRegistration({ name: 'A', email: 'a@b.co', password: TEST_PASSWORD })).length, 0);

  assert.ok(validateRegistration({ name: '', email: 'a@b.co', password: TEST_PASSWORD }).name);
  assert.ok(validateRegistration({ name: 'A', email: 'nope', password: TEST_PASSWORD }).email);
  assert.ok(validateRegistration({ name: 'A', email: 'a@b.co', password: 'short' }).password);
  assert.ok(
    validateRegistration({ name: 'A', email: 'a@b.co', password: TEST_PASSWORD, confirmPassword: 'other' })
      .confirmPassword
  );

  // A short password must be refused even when the confirmation matches it.
  const short = validateRegistration({ name: 'A', email: 'a@b.co', password: 'abc', confirmPassword: 'abc' });
  assert.ok(short.password);
  assert.equal(short.confirmPassword, undefined, 'one problem gets one message');
});

test('A9 — an account is looked up by a normalised email, so case cannot duplicate it', () => {
  const dir = tempDir();
  const store = createUserStore({ filePath: path.join(dir, 'users.json') });

  const created = store.create({ name: 'Sam', email: 'Sam@Example.com', password: TEST_PASSWORD });
  assert.equal(created.ok, true);
  assert.equal(created.user.email, 'Sam@Example.com', 'what the trader typed is kept');
  assert.equal(created.user.emailNormalized, 'sam@example.com');

  // Every casing finds the same account...
  for (const variant of ['sam@example.com', 'SAM@EXAMPLE.COM', '  Sam@Example.com  ']) {
    assert.equal(store.findByEmail(variant).user?.id, created.user.id, variant);
  }

  // ...which is why the duplicate is refused.
  const again = store.create({ name: 'Other', email: 'SAM@example.COM', password: 'another-password' });
  assert.equal(again.ok, false);
  assert.equal(again.conflict, true);
  assert.equal(store.count(), 1);

  assert.equal(normalizeEmail('  MiXeD@Case.COM '), 'mixed@case.com');
});

test('A10 — the stored account carries a hash, and publicUser never carries it', () => {
  const dir = tempDir();
  const file = path.join(dir, 'users.json');
  const store = createUserStore({ filePath: file });

  const created = store.create({ name: 'Ada', email: 'ada@example.com', password: TEST_PASSWORD });
  const onDisk = JSON.parse(fs.readFileSync(file, 'utf8'));

  assert.equal(onDisk.users.length, 1);
  const stored = onDisk.users[0];
  assert.ok(stored.passwordHash.startsWith('scrypt$'), 'the record holds a hash');
  assert.equal(JSON.stringify(onDisk).includes(TEST_PASSWORD), false, 'the plaintext is not on disk');
  assert.equal(stored.passwordHash, created.user.passwordHash);

  const safe = publicUser(created.user);
  assert.deepEqual(Object.keys(safe).sort(), ['createdAt', 'email', 'id', 'name']);
  assert.equal('passwordHash' in safe, false);
  assert.equal(JSON.stringify(safe).includes('scrypt$'), false);
});

test('A11 — authenticate refuses an unknown account and a wrong password identically', () => {
  const dir = tempDir();
  const store = createUserStore({ filePath: path.join(dir, 'users.json') });
  store.create({ name: 'Ada', email: 'ada@example.com', password: TEST_PASSWORD });

  const wrongPassword = store.authenticate('ada@example.com', 'definitely-not-it');
  const unknownAccount = store.authenticate('nobody@example.com', TEST_PASSWORD);

  // The results are structurally identical: nothing distinguishes them.
  assert.deepEqual(wrongPassword, unknownAccount);
  assert.equal(wrongPassword.ok, true);
  assert.equal(wrongPassword.user, null);
  assert.equal('reason' in wrongPassword, false, 'the store does not even know which it was');

  const right = store.authenticate('ADA@example.com', TEST_PASSWORD);
  assert.equal(right.user.email, 'ada@example.com');
});

test('A12 — the users file is written atomically and read back whole', () => {
  const dir = tempDir();
  const file = path.join(dir, 'users.json');
  const store = createUserStore({ filePath: file });

  store.create({ name: 'One', email: 'one@example.com', password: TEST_PASSWORD });
  store.create({ name: 'Two', email: 'two@example.com', password: TEST_PASSWORD });

  // No temp file is left behind by the write.
  const leftovers = fs.readdirSync(dir).filter((f) => f.includes('.tmp'));
  assert.deepEqual(leftovers, []);

  // A fresh store (a restart) sees both accounts.
  const restarted = createUserStore({ filePath: file });
  assert.equal(restarted.count(), 2);
  assert.equal(restarted.authenticate('two@example.com', TEST_PASSWORD).user.name, 'Two');
});

// ============================================================================
// The session store
// ============================================================================

test('A13 — a session is stored as a digest, so the file holds no usable token', () => {
  const dir = tempDir();
  const file = path.join(dir, 'sessions.json');
  const store = createSessionStore({ filePath: file });

  const opened = store.create('user-1');
  assert.equal(opened.ok, true);
  assert.equal(isWellFormedToken(opened.token), true, 'the token handed out is well-formed');

  const raw = fs.readFileSync(file, 'utf8');
  assert.equal(raw.includes(opened.token), false, 'the raw token must not be on disk');
  assert.equal(raw.includes(hashToken(opened.token)), true, 'only its digest is stored');

  const row = JSON.parse(raw).sessions[0];
  assert.deepEqual(Object.keys(row).sort(), [
    'createdAt',
    'expiresAt',
    'lastSeenAt',
    'tokenHash',
    'userId',
  ]);
});

test('A14 — a session survives a restart, and dies on logout', () => {
  const dir = tempDir();
  const file = path.join(dir, 'sessions.json');

  const opened = createSessionStore({ filePath: file }).create('user-1');

  // "Restart": a brand new store over the same file.
  const restarted = createSessionStore({ filePath: file });
  const resolved = restarted.resolve(opened.token);
  assert.equal(resolved.ok, true);
  assert.equal(resolved.session.userId, 'user-1');

  restarted.destroy(opened.token);
  assert.equal(createSessionStore({ filePath: file }).resolve(opened.token).session, null);
});

test('A15 — a malformed, unknown and expired token are all answered the same way', () => {
  const dir = tempDir();
  const store = createSessionStore({ filePath: path.join(dir, 'sessions.json') });
  const opened = store.create('user-1');

  const malformed = store.resolve('not-a-token');
  const unknown = store.resolve('A'.repeat(43));
  assert.deepEqual(malformed, unknown, 'a malformed token is not distinguishable from an unknown one');
  assert.equal(malformed.ok, true);
  assert.equal(malformed.session, null);
  assert.equal('reason' in malformed, false);

  // An expired session is the same answer again — and the row is cleaned up.
  const past = new Date(Date.now() - SESSION_TTL_MS - 1000);
  const stale = store.create('user-2', past);
  const expired = store.resolve(stale.token);
  assert.equal(expired.session, null);
  assert.equal('reason' in expired, false, 'an expired session must not say it expired');
  assert.equal(store.resolve(stale.token).session, null);

  assert.equal(isExpired({ expiresAt: past.toISOString() }), true);
  assert.equal(isExpired({ expiresAt: new Date(Date.now() + 60000).toISOString() }), false);

  // Fail CLOSED. A session row whose expiry is missing or unreadable must not
  // become an immortal session, so "cannot tell when it ends" means "it ends".
  for (const unusable of [{}, { expiresAt: '' }, { expiresAt: 'not a date' }, null]) {
    assert.equal(isExpired(unusable), true, `${JSON.stringify(unusable)} must be treated as expired`);
  }
});

test('A16 — logging out destroys only this session; all-device logout clears them all', () => {
  const dir = tempDir();
  const file = path.join(dir, 'sessions.json');
  const store = createSessionStore({ filePath: file });

  const laptop = store.create('user-1');
  const phone = store.create('user-1');
  const other = store.create('user-2');

  store.destroy(laptop.token);
  assert.equal(store.resolve(laptop.token).session, null);
  assert.equal(store.resolve(phone.token).session.userId, 'user-1', 'the other device stays signed in');

  store.destroyAllForUser('user-1');
  assert.equal(store.resolve(phone.token).session, null);
  assert.equal(store.resolve(other.token).session.userId, 'user-2', 'another account is untouched');
});

// ============================================================================
// The routes
// ============================================================================

test('A17 — register creates an account, signs it in, and returns no secret', async (t) => {
  const kit = await createAuthTestKit({ routers: [] });
  t.after(() => kit.cleanup());

  const response = await kit.post('/api/auth/register', {
    name: 'Real Trader',
    email: 'real@example.com',
    password: TEST_PASSWORD,
  });
  assert.equal(response.status, 201);

  const body = await response.json();
  assert.equal(body.status, 'ok');
  assert.equal(body.user.email, 'real@example.com');
  assert.deepEqual(Object.keys(body.user).sort(), ['createdAt', 'email', 'id', 'name']);

  // No secret anywhere in the response, in any shape.
  const strings = allStrings(body);
  assert.equal(strings.some((s) => s.includes(TEST_PASSWORD)), false, 'the password must not be echoed');
  assert.equal(strings.some((s) => s.includes('scrypt$')), false, 'the hash must not be echoed');
  assert.equal(body.token, undefined, 'the token is not in the body');
  assert.equal(body.session, undefined);

  // The cookie is set, and is HttpOnly + SameSite=Lax.
  const setCookie = response.headers.getSetCookie()[0];
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Lax/);

  // The account really is on disk, as a hash.
  const raw = fs.readFileSync(kit.files.users, 'utf8');
  assert.equal(raw.includes(TEST_PASSWORD), false);
  assert.equal(raw.includes('scrypt$'), true);

  // And the cookie it returned actually opens the protected route.
  const me = await kit.get('/api/auth/me', { cookie: setCookie.split(';')[0] });
  const meBody = await me.json();
  assert.equal(meBody.authenticated, true);
  assert.equal(meBody.user.id, body.user.id);
});

test('A18 — a duplicate registration is refused without revealing anything else', async (t) => {
  const kit = await createAuthTestKit({ routers: [] });
  t.after(() => kit.cleanup());

  await kit.register({ email: 'dup@example.com' });
  const again = await kit.post('/api/auth/register', {
    name: 'Someone Else',
    email: 'DUP@Example.com',
    password: 'a-completely-different-password',
  });

  assert.equal(again.status, 409);
  const body = await again.json();
  assert.equal(body.status, 'duplicate');
  assert.equal(body.user, null);
  assert.ok(body.errors.email);

  // Only one account exists.
  const raw = JSON.parse(fs.readFileSync(kit.files.users, 'utf8'));
  assert.equal(raw.users.length, 1);
});

test('A19 — a malformed registration is a 400 with per-field errors', async (t) => {
  const kit = await createAuthTestKit({ routers: [] });
  t.after(() => kit.cleanup());

  const response = await kit.post('/api/auth/register', { name: '', email: 'bad', password: 'x' });
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.status, 'invalid');
  assert.ok(body.errors.name);
  assert.ok(body.errors.email);
  assert.ok(body.errors.password);
  assert.equal(fs.existsSync(kit.files.users), false, 'a rejected registration writes nothing');
});

test('A20 — sign-in failure is one message and one status for every cause', async (t) => {
  const kit = await createAuthTestKit({ routers: [] });
  t.after(() => kit.cleanup());

  await kit.register({ email: 'known@example.com' });

  const wrongPassword = await kit.post('/api/auth/login', {
    email: 'known@example.com',
    password: 'wrong-password-here',
  });
  const unknownAccount = await kit.post('/api/auth/login', {
    email: 'unknown@example.com',
    password: TEST_PASSWORD,
  });
  const malformed = await kit.post('/api/auth/login', { email: 'not-an-email', password: '' });
  const missing = await kit.post('/api/auth/login', {});

  for (const response of [wrongPassword, unknownAccount, malformed, missing]) {
    assert.equal(response.status, 401, 'every failure is a 401');
  }

  const bodies = await Promise.all([wrongPassword, unknownAccount, malformed, missing].map((r) => r.json()));
  const messages = new Set(bodies.map((b) => b.message));
  const statuses = new Set(bodies.map((b) => b.status));

  assert.equal(messages.size, 1, `one message for every cause, got ${[...messages].join(' | ')}`);
  assert.equal(statuses.size, 1);
  assert.equal(bodies[0].status, 'invalid-credentials');
  assert.equal(bodies[0].user, null);
  // The message must not name the field that was wrong — that is the oracle.
  assert.match(bodies[0].message, /Email or password is incorrect/);
  // And no failure sets a session cookie.
  assert.equal(wrongPassword.headers.getSetCookie().length, 0);
  assert.equal(unknownAccount.headers.getSetCookie().length, 0);
});

test('A21 — a correct sign-in opens a session that works on a protected route', async (t) => {
  const kit = await createAuthTestKit({ routers: [] });
  t.after(() => kit.cleanup());

  const { user } = await kit.register({ email: 'known@example.com' });

  const login = await kit.post('/api/auth/login', { email: 'known@example.com', password: TEST_PASSWORD });
  assert.equal(login.status, 200);
  const body = await login.json();
  assert.equal(body.status, 'ok');
  assert.equal(body.user.id, user.id);
  assert.equal(JSON.stringify(body).includes('scrypt$'), false);

  const cookie = login.headers.getSetCookie()[0].split(';')[0];
  const session = await kit.get('/api/auth/session', { cookie });
  assert.equal(session.status, 200);
  assert.equal((await session.json()).authenticated, true);
});

test('A22 — /auth/me answers 200 when signed out, and the protected route does not', async (t) => {
  const kit = await createAuthTestKit({ routers: [] });
  t.after(() => kit.cleanup());

  const anon = await kit.get('/api/auth/me');
  assert.equal(anon.status, 200, 'asking "am I signed in?" is not an error');
  const anonBody = await anon.json();
  assert.equal(anonBody.authenticated, false);
  assert.equal(anonBody.user, null);

  // The protected route refuses with one body for every way of being unknown.
  for (const cookie of [null, 'tg_session=not-a-token', `tg_session=${'A'.repeat(43)}`]) {
    const response = await kit.get('/api/auth/session', cookie ? { cookie } : {});
    assert.equal(response.status, 401);
    const body = await response.json();
    assert.equal(body.status, 'unauthenticated');
    assert.equal(body.message, 'Sign in to continue.');
    assert.equal(body.user, undefined, 'a refusal carries no account information');
  }
});

test('A23 — logout destroys the session and clears the cookie', async (t) => {
  const kit = await createAuthTestKit({ routers: [] });
  t.after(() => kit.cleanup());

  const { cookie } = await kit.signedInUser();
  assert.equal((await kit.get('/api/auth/session', { cookie })).status, 200);

  const logout = await kit.post('/api/auth/logout', {}, { cookie });
  assert.equal(logout.status, 200);
  assert.equal((await logout.json()).authenticated, false);

  // The cookie is cleared with matching attributes.
  const cleared = logout.headers.getSetCookie()[0];
  assert.match(cleared, /Max-Age=0/);
  assert.match(cleared, /HttpOnly/);

  // The old token is dead — reusing it is refused.
  assert.equal((await kit.get('/api/auth/session', { cookie })).status, 401);

  // Logging out again is still a 200, not an error.
  assert.equal((await kit.post('/api/auth/logout', {}, { cookie })).status, 200);
  assert.equal((await kit.post('/api/auth/logout', {})).status, 200, 'logging out signed-out is fine');
});

test('A24 — a session whose account no longer exists is not a session', async (t) => {
  const kit = await createAuthTestKit({ routers: [] });
  t.after(() => kit.cleanup());

  const { cookie } = await kit.signedInUser();
  assert.equal((await kit.get('/api/auth/session', { cookie })).status, 200);

  // Remove the account, leaving the session row behind — exactly what a deleted
  // account looks like.
  fs.writeFileSync(kit.files.users, JSON.stringify({ version: 1, users: [] }), 'utf8');

  const response = await kit.get('/api/auth/session', { cookie });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).status, 'unauthenticated');
});

test('A25 — the auth routes are wired where the app expects them', async (t) => {
  // Mounted by server/index.js at /api, so the full paths are what the frontend
  // calls. This asserts the router's own paths rather than the app's mounting.
  const kit = await createAuthTestKit({ routers: [authRouter] });
  t.after(() => kit.cleanup());

  assert.equal((await kit.post('/api/auth/register', {})).status, 400);
  assert.equal((await kit.post('/api/auth/login', {})).status, 401);
  assert.equal((await kit.get('/api/auth/me')).status, 200);
  assert.equal((await kit.get('/api/auth/session')).status, 401);
});

test('A26 — a signed-out caller gets no session cookie from any auth response', async (t) => {
  const kit = await createAuthTestKit({ routers: [] });
  t.after(() => kit.cleanup());

  const responses = [
    await kit.get('/api/auth/me'),
    await kit.get('/api/auth/session'),
    await kit.post('/api/auth/login', { email: 'nobody@example.com', password: 'nope-nope-nope' }),
    await kit.post('/api/auth/register', { name: '', email: '', password: '' }),
  ];

  for (const response of responses) {
    const cookies = response.headers.getSetCookie();
    const set = cookies.filter((c) => !c.includes('Max-Age=0'));
    assert.equal(set.length, 0, `no session cookie should be set: ${cookies.join(' | ')}`);
  }
});
