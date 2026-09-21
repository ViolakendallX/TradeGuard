/**
 * The authorization gate.
 *
 * THE ONE RULE THIS FILE EXISTS TO ENFORCE
 * The server derives the user from the SESSION, never from the request. No route
 * anywhere accepts a `userId` from the client, and `req.user` is set only here,
 * only from a session that resolved to a real account. That is what makes
 * "never trust a userId supplied by the frontend" structural rather than a
 * convention someone has to remember.
 *
 * WHY `req.user` AND NOT A REQUEST FIELD
 * `req` is a server-side object. A client cannot reach it. So a route that reads
 * `req.user.id` is reading something only this middleware could have written.
 *
 * THE COOKIE IS THE ONLY CREDENTIAL
 * There is no `Authorization: Bearer` path and no token in the body. Supporting a
 * second way in would mean a second thing to get right, and the browser already
 * has a mechanism for sending a secret it cannot read.
 *
 * WHAT AN UNKNOWN CALLER SEES
 * One response, identical for a missing cookie, a malformed token, an expired
 * session and a token for a deleted account:
 *
 *     401 { status: 'unauthenticated', message: 'Sign in to continue.' }
 *
 * Telling those apart would answer "does this session exist?" for a caller who
 * has not proved they are entitled to ask.
 */

import {
  createSessionStore,
  SESSION_COOKIE,
} from '../services/sessionStore.js';
import { createUserStore, publicUser } from '../services/userStore.js';
import { parseCookies } from '../lib/cookies.js';

/** The single body every unauthenticated response carries. */
export const UNAUTHENTICATED_STATUS = 'unauthenticated';
export const UNAUTHENTICATED_MESSAGE = 'Sign in to continue.';

/**
 * Resolves the session behind a request without enforcing anything.
 *
 * @returns {{ user: object|null, token: string|null, problem: string|null }}
 */
export function resolveRequestUser(req) {
  const cookies = parseCookies(req?.headers?.cookie);
  const token = cookies[SESSION_COOKIE];
  if (!token) return { user: null, token: null, problem: null };

  const sessions = createSessionStore();
  const resolved = sessions.resolve(token);
  if (!resolved.ok || !resolved.session) return { user: null, token, problem: resolved.problem ?? null };

  const users = createUserStore();
  const found = users.getById(resolved.session.userId);
  // A session whose account no longer exists is not a session.
  if (!found.ok || !found.user) return { user: null, token, problem: found.problem ?? null };

  return { user: found.user, token, problem: null };
}

/**
 * Requires an authenticated user. Attaches `req.user` (the full record, including
 * the password hash — it never leaves the server because every response goes
 * through `publicUser()`).
 */
export function requireAuth(req, res, next) {
  const { user } = resolveRequestUser(req);

  if (!user) {
    return res.status(401).json({
      status: UNAUTHENTICATED_STATUS,
      authenticated: false,
      message: UNAUTHENTICATED_MESSAGE,
    });
  }

  req.user = user;
  return next();
}

/**
 * Attaches `req.user` when there is one, and continues either way.
 * For routes that are public but behave differently for a signed-in caller.
 */
export function optionalAuth(req, _res, next) {
  const { user } = resolveRequestUser(req);
  if (user) req.user = user;
  return next();
}

/** The public shape of the signed-in user. The only user body a response carries. */
export function sessionUser(user) {
  return publicUser(user);
}

export { SESSION_COOKIE };
