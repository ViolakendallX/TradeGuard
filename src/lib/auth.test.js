/**
 * Authentication — validation and honesty invariants.
 *
 * Two things are pinned here, and they are the two things that could silently go
 * wrong later:
 *
 *   1. The validation rules — the messages a trader actually sees when an email
 *      is malformed, a password is too short, or a confirmation does not match.
 *   2. The honesty of the outcome. Authentication is real now, so a success state
 *      exists — and the danger has changed shape rather than gone away: the thing
 *      that must not happen is a success that did not come from the server. These
 *      tests run with no server reachable, which is exactly the condition under
 *      which a fabricated login would show up.
 *
 * The screens themselves are exercised in the browser harness, where a real DOM,
 * real focus, real typing and a real API exist.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  AUTH_STATUS,
  EMPTY_CREATE_ACCOUNT,
  EMPTY_SIGN_IN,
  PASSWORD_MIN_LENGTH,
  PASSWORD_RECOVERY_MESSAGE,
  PASSWORD_RECOVERY_TITLE,
  createAccount,
  isFilled,
  requestPasswordReset,
  signIn,
  validateCreateAccountForm,
  validateSignInForm,
} from './auth.js';

// --- sign-in validation -----------------------------------------------------

test('an empty sign-in form reports both fields', () => {
  const errors = validateSignInForm(EMPTY_SIGN_IN);
  assert.equal(errors.email, 'Enter your email address.');
  assert.equal(errors.password, 'Enter your password.');
});

test('a malformed email is reported as invalid', () => {
  for (const email of ['name', 'name@', 'name@example', '@example.com', 'a b@example.com']) {
    const errors = validateSignInForm({ email, password: 'correct-horse' });
    assert.match(errors.email ?? '', /valid email address/, `expected ${email} to be rejected`);
  }
});

test('a well-formed email passes, whatever the address is', () => {
  for (const email of ['name@example.com', 'trader.name+tag@sub.example.co', 'a@b.io']) {
    const errors = validateSignInForm({ email, password: 'correct-horse' });
    assert.deepEqual(errors, {}, `expected ${email} to be accepted`);
  }
});

test('sign-in does not impose a length rule on an existing password', () => {
  // A trader may have an old, short password. Whether it is right is a question
  // for a server; this screen must not invent a rule and block them locally.
  const errors = validateSignInForm({ email: 'name@example.com', password: 'x' });
  assert.deepEqual(errors, {});
});

test('a whitespace-only password counts as missing, not as a password', () => {
  const errors = validateSignInForm({ email: 'name@example.com', password: '   ' });
  assert.equal(errors.password, 'Enter your password.');
});

test('surrounding whitespace in an email is not treated as invalid', () => {
  const errors = validateSignInForm({ email: '  name@example.com  ', password: 'correct-horse' });
  assert.deepEqual(errors, {});
});

test('sign-in validation tolerates a missing form object', () => {
  assert.doesNotThrow(() => validateSignInForm());
  assert.doesNotThrow(() => validateSignInForm(undefined));
  assert.equal(validateSignInForm().email, 'Enter your email address.');
});

// --- create-account validation ---------------------------------------------

const validAccount = {
  name: 'Alex Trader',
  email: 'alex@example.com',
  password: 'correct-horse',
  confirmPassword: 'correct-horse',
};

test('a complete account form is accepted', () => {
  assert.deepEqual(validateCreateAccountForm(validAccount), {});
});

test('every required account field is reported when empty', () => {
  const errors = validateCreateAccountForm(EMPTY_CREATE_ACCOUNT);
  assert.equal(errors.name, 'Enter your name.');
  assert.equal(errors.email, 'Enter your email address.');
  assert.equal(errors.password, 'Choose a password.');
  assert.equal(errors.confirmPassword, 'Re-enter your password to confirm it.');
});

test('a password shorter than the minimum is rejected, and the minimum itself is accepted', () => {
  const short = validateCreateAccountForm({ ...validAccount, password: 'a'.repeat(PASSWORD_MIN_LENGTH - 1) });
  assert.match(short.password ?? '', /at least 8 characters/);

  const exact = validateCreateAccountForm({
    ...validAccount,
    password: 'a'.repeat(PASSWORD_MIN_LENGTH),
    confirmPassword: 'a'.repeat(PASSWORD_MIN_LENGTH),
  });
  assert.equal(exact.password, undefined);
});

test('a confirmation that does not match is rejected', () => {
  const errors = validateCreateAccountForm({ ...validAccount, confirmPassword: 'something-else' });
  assert.equal(errors.confirmPassword, 'Passwords do not match.');
});

test('a mismatched confirmation is not reported twice when the password is itself invalid', () => {
  // One clear message per field: "use at least 8 characters" is the actionable
  // one, and "they do not match" would be noise on top of it.
  const errors = validateCreateAccountForm({ ...validAccount, password: 'short', confirmPassword: 'other' });
  assert.match(errors.password ?? '', /at least 8 characters/);
  assert.equal(errors.confirmPassword, undefined);
});

test('a name of only whitespace counts as missing', () => {
  const errors = validateCreateAccountForm({ ...validAccount, name: '   ' });
  assert.equal(errors.name, 'Enter your name.');
});

test('an invalid email is reported on the account form too', () => {
  const errors = validateCreateAccountForm({ ...validAccount, email: 'not-an-email' });
  assert.match(errors.email ?? '', /valid email address/);
});

test('account validation tolerates a missing form object', () => {
  assert.doesNotThrow(() => validateCreateAccountForm());
  assert.equal(validateCreateAccountForm().name, 'Enter your name.');
});

// --- the empty state --------------------------------------------------------

test('isFilled distinguishes an untouched form from a started one', () => {
  assert.equal(isFilled(EMPTY_SIGN_IN, ['email', 'password']), false);
  assert.equal(isFilled({ email: 'name@example.com', password: '' }, ['email', 'password']), false);
  assert.equal(isFilled({ email: 'name@example.com', password: '   ' }, ['email', 'password']), false);
  assert.equal(isFilled({ email: 'name@example.com', password: 'x' }, ['email', 'password']), true);
});

test('isFilled treats a missing form as empty rather than throwing', () => {
  assert.equal(isFilled(undefined, ['email']), false);
  assert.equal(isFilled(EMPTY_CREATE_ACCOUNT, []), true);
});

// --- the outcome's honesty --------------------------------------------------

/**
 * Every test below runs with no API reachable: `fetch` is called with a relative
 * URL, which has no origin outside a browser. That is the useful condition — it
 * is the one under which a client that invented a session would be caught.
 */

test('signing in never reports success when the server cannot be reached', async () => {
  const result = await signIn({ email: 'name@example.com', password: 'correct-horse' });

  assert.equal(result.ok, false);
  assert.equal(result.status, AUTH_STATUS.UNAVAILABLE);
  assert.equal(result.user, null, 'a failure must never carry a user');
  assert.match(result.title, /could not reach the server/i);
});

test('creating an account never reports success when the server cannot be reached', async () => {
  const result = await createAccount(validAccount);

  assert.equal(result.ok, false);
  assert.equal(result.status, AUTH_STATUS.UNAVAILABLE);
  assert.equal(result.user, null);
});

test('success exists as a vocabulary, but is unreachable without a server answer', () => {
  // This replaces an earlier guard that forbade a SUCCESS key outright. It was
  // right when authentication was a UI foundation and no server existed; now that
  // accounts are real, forbidding the word would just mean lying about the state
  // the screens are in. What is still forbidden is reaching it locally — which the
  // two tests above establish, and which this one pins by name.
  assert.equal(typeof AUTH_STATUS.SUCCESS, 'string');
  assert.equal(AUTH_STATUS.SIGNED_IN, undefined, 'the app has one session concept, and it lives in useAuth');
});

test('the client is async, so the screens exercise a real loading path', async () => {
  const pending = signIn({ email: 'name@example.com', password: 'x' });
  assert.ok(pending instanceof Promise);
  await pending;
});

test('the client never throws, even with no arguments', async () => {
  await assert.doesNotReject(() => signIn());
  await assert.doesNotReject(() => createAccount());
  await assert.doesNotReject(() => requestPasswordReset());
});

test('a failure carries field errors only when the server sent some', async () => {
  const unreachable = await signIn({ email: 'name@example.com', password: 'x' });
  assert.deepEqual(unreachable.errors, {}, 'a network failure is not a field problem');
});

test('password recovery is honest rather than a dead control', async () => {
  const result = await requestPasswordReset({ email: 'name@example.com' });
  assert.equal(result.ok, false);
  assert.match(result.title, /password recovery/i);
});

test('password recovery answers the question that was actually asked', async () => {
  // "Forgot password?" is not "sign in failed". A control that answers the wrong
  // question is worse than no control, so the recovery copy is pinned separately
  // from every other outcome.
  const result = await requestPasswordReset({ email: 'name@example.com' });
  assert.equal(result.title, PASSWORD_RECOVERY_TITLE);
  assert.equal(result.message, PASSWORD_RECOVERY_MESSAGE);
  assert.match(result.title, /not available/i);
  // The two facts a trader needs: the password is hashed, and it cannot be read back.
  assert.match(result.message, /secure hash/i);
  assert.match(result.message, /read it back/i);

  // And it must not be another outcome's message wearing a different hat.
  const unreachable = await signIn({ email: 'name@example.com', password: 'x' });
  assert.notEqual(result.message, unreachable.message);
  assert.notEqual(result.title, unreachable.title);
  assert.notEqual(result.status, unreachable.status);
});

test('the form models are the single source of an empty form', () => {
  assert.deepEqual(Object.keys(EMPTY_SIGN_IN).sort(), ['email', 'password']);
  assert.deepEqual(Object.keys(EMPTY_CREATE_ACCOUNT).sort(), [
    'confirmPassword',
    'email',
    'name',
    'password',
  ]);
});
