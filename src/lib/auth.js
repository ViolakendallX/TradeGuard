/**
 * TradeGuard — authentication.
 *
 * WHAT THIS FILE IS
 * The form models, the validation rules, and the client for the real account
 * service. `signIn` and `createAccount` talk to `/api/auth/*`, which is the only
 * place a credential is ever checked.
 *
 * WHAT THIS FILE WILL NOT DO
 *   - It does not decide whether a sign-in succeeded. The server does. A 401 is a
 *     401, and there is no branch here that turns one into a session.
 *   - It does not hold a session, a token or a user. The session lives in an
 *     HttpOnly cookie the page cannot read, so this module could not store it
 *     even if it wanted to; the app asks `/api/auth/me` who it is.
 *   - It does not keep a password. The password is passed to the request and is
 *     not assigned to anything that outlives the call.
 *   - It does not offer password recovery, because none exists. `requestPasswordReset`
 *     says so rather than pretending to send an email.
 *
 * WHY THE VALIDATION IS HERE AND ALSO ON THE SERVER
 * The copy here is for the trader: it says what to fix, in the field where it
 * needs fixing, before a round-trip. It is a convenience, not a control. The
 * server re-applies the same rules, because a client that skips its own
 * validation must still not be able to create a weak account.
 *
 * Validation is a pure function returning a field -> message map, mirroring
 * `src/lib/validation.js`, so the rules are testable without a DOM.
 */

import { loginAccount, registerAccount } from './api.js';

/** Pragmatic email shape check: one @, a dotted domain, no whitespace. */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const NAME_MAX_LENGTH = 80;

/**
 * The states a submit can be in, and the states it can end in.
 *
 * `SUCCESS` is a real outcome now — but it is only ever produced by a response
 * from the server that said so. There is no path here that reaches it from a
 * local decision.
 */
export const AUTH_STATUS = Object.freeze({
  IDLE: 'idle',
  LOADING: 'loading',
  SUCCESS: 'success',
  /** The fields did not pass validation — here or on the server. */
  INVALID: 'invalid',
  /** The email already has an account. */
  DUPLICATE: 'duplicate',
  /** The server refused the credentials. It will not say which one was wrong. */
  REJECTED: 'rejected',
  /** The request never got an answer — the API is down or unreachable. */
  UNAVAILABLE: 'unavailable',
  /**
   * The feature does not exist in this build. Distinct from UNAVAILABLE, which
   * means the server was asked and did not answer: conflating "we could not ask"
   * with "there is nothing to ask" would describe a network problem as a product
   * decision.
   */
  NOT_AVAILABLE: 'not-available',
});

export const AUTH_INVALID_TITLE = 'Check the highlighted fields';
export const AUTH_DUPLICATE_TITLE = 'That email address is already registered';
export const AUTH_REJECTED_TITLE = 'Sign-in failed';
export const AUTH_UNAVAILABLE_TITLE = 'TradeGuard could not reach the server';

/**
 * The honest answer to "Forgot password?".
 *
 * Accounts are real, so this is no longer "there is no account system". It is
 * the narrower truth: there is no self-service recovery in this build. Saying
 * that is better than a link that appears to send an email and does not.
 */
export const PASSWORD_RECOVERY_TITLE = 'Password recovery is not available in this build';

export const PASSWORD_RECOVERY_MESSAGE =
  'Your account and password are real, and your password is stored only as a secure hash — ' +
  'which also means nobody, including TradeGuard, can read it back to you. There is no ' +
  'self-service reset in this build, so there is no email to send.';

/** A sign-in needs only the two credentials. */
export const EMPTY_SIGN_IN = Object.freeze({ email: '', password: '' });

/** Account creation additionally needs a name and a confirmed password. */
export const EMPTY_CREATE_ACCOUNT = Object.freeze({
  name: '',
  email: '',
  password: '',
  confirmPassword: '',
});

export const SIGN_IN_FIELDS = Object.freeze(['email', 'password']);
export const CREATE_ACCOUNT_FIELDS = Object.freeze(['name', 'email', 'password', 'confirmPassword']);

const text = (value) => String(value ?? '');

/**
 * Sign-in validation.
 *
 * A wrong-but-well-formed email is NOT an error here — only an unparseable one
 * is. Whether the credentials are correct is the server's answer to give, and
 * this screen must not guess at it.
 */
export function validateSignInForm(form = {}) {
  const errors = {};
  const email = text(form.email).trim();
  const password = text(form.password);

  if (!email) {
    errors.email = 'Enter your email address.';
  } else if (!EMAIL_PATTERN.test(email)) {
    errors.email = 'Enter a valid email address, for example name@example.com.';
  }

  // A password of nothing but spaces is not a password. Only the emptiness test
  // looks past whitespace — the password itself is never trimmed, so a passphrase
  // that genuinely begins or ends with a space still works.
  if (!password.trim()) {
    errors.password = 'Enter your password.';
  }

  return errors;
}

/**
 * Account-creation validation.
 *
 * The password rules are enforced here because they are a statement about what
 * this product accepts — a rule the user can act on. They are checked in order of
 * what the trader needs to know first: missing, then too short, then too long,
 * then mismatched.
 */
export function validateCreateAccountForm(form = {}) {
  const errors = {};
  const name = text(form.name).trim();
  const email = text(form.email).trim();
  const password = text(form.password);
  const confirmPassword = text(form.confirmPassword);

  if (!name) {
    errors.name = 'Enter your name.';
  } else if (name.length > NAME_MAX_LENGTH) {
    errors.name = `Name must be ${NAME_MAX_LENGTH} characters or fewer.`;
  }

  if (!email) {
    errors.email = 'Enter your email address.';
  } else if (!EMAIL_PATTERN.test(email)) {
    errors.email = 'Enter a valid email address, for example name@example.com.';
  }

  // The password is judged first, and the confirmation only against a password
  // that is itself acceptable. Piling "they do not match" on top of "use at least
  // 8 characters" gives the trader two messages for one problem, and the second
  // one is not the actionable one.
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

  if (!confirmPassword) {
    errors.confirmPassword = 'Re-enter your password to confirm it.';
  } else if (passwordUsable && confirmPassword !== password) {
    errors.confirmPassword = 'Passwords do not match.';
  }

  return errors;
}

/** True when every named field carries non-blank text. Drives the empty state. */
export function isFilled(form = {}, fields = []) {
  return fields.every((field) => text(form[field]).trim() !== '');
}

/**
 * Maps a service result onto the shape the screens render.
 *
 * One place decides which title a failure gets, so the two screens cannot drift
 * apart in how they describe the same outcome.
 */
function outcome(result) {
  if (result.ok) {
    return { ok: true, status: AUTH_STATUS.SUCCESS, user: result.user || null, errors: {}, title: null, message: result.message ?? null };
  }

  switch (result.kind) {
    case 'invalid':
      return {
        ok: false,
        status: AUTH_STATUS.INVALID,
        user: null,
        errors: result.errors || {},
        title: AUTH_INVALID_TITLE,
        message: result.message || 'Correct the fields marked below, then try again.',
      };
    case 'duplicate':
      return {
        ok: false,
        status: AUTH_STATUS.DUPLICATE,
        user: null,
        errors: result.errors || {},
        title: AUTH_DUPLICATE_TITLE,
        message: result.message || 'That email address already has an account. Sign in instead.',
      };
    case 'rejected':
      return {
        ok: false,
        status: AUTH_STATUS.REJECTED,
        user: null,
        errors: {},
        title: AUTH_REJECTED_TITLE,
        message: result.message || 'Email or password is incorrect.',
      };
    default:
      return {
        ok: false,
        status: AUTH_STATUS.UNAVAILABLE,
        user: null,
        errors: {},
        title: AUTH_UNAVAILABLE_TITLE,
        message: result.message || 'Sign-in could not be completed. Try again.',
      };
  }
}

/**
 * Signs in.
 *
 * Resolves — never throws — so the screen always has something to render. The
 * password is passed straight to the request and is not retained.
 */
export async function signIn({ email, password } = {}) {
  return outcome(await loginAccount({ email: text(email).trim(), password: text(password) }));
}

/** Creates an account. On success the server also opens a session. */
export async function createAccount({ name, email, password, confirmPassword } = {}) {
  return outcome(
    await registerAccount({
      name: text(name).trim(),
      email: text(email).trim(),
      password: text(password),
      // The server re-checks the confirmation; sending it means a mismatch is
      // caught there too, not only in this browser.
      confirmPassword: confirmPassword === undefined ? text(password) : text(confirmPassword),
    })
  );
}

/**
 * The honest answer to "Forgot password?".
 *
 * Carries its own copy rather than the generic one, because "your password is
 * hashed and cannot be recovered" is a different answer to a different question
 * than "the server is unreachable" — and a control that answers the wrong
 * question is worse than no control.
 */
export function requestPasswordReset() {
  return Promise.resolve({
    ok: false,
    status: AUTH_STATUS.NOT_AVAILABLE,
    errors: {},
    title: PASSWORD_RECOVERY_TITLE,
    message: PASSWORD_RECOVERY_MESSAGE,
  });
}
