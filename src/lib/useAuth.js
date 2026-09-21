/**
 * The app's view of who is signed in.
 *
 * THE SERVER IS THE ONLY AUTHORITY
 * Nothing here decides whether a session is valid. The session token is in an
 * HttpOnly cookie the page cannot read, so the frontend has no way to inspect it
 * — it asks `/api/auth/me`, and takes the answer. That is why there is no
 * "isSignedIn" boolean in localStorage: a boolean can be edited, and an edited
 * boolean would gate the UI while the server still refused every request.
 *
 * FOUR STATES, AND WHY `checking` IS ONE OF THEM
 * On first paint the app genuinely does not know yet. Rendering the sign-in
 * screen during that moment would flash a login page at a trader who is already
 * signed in; rendering the app would show the shell to someone who is not. So
 * `checking` is a real state with its own render, and it resolves in one
 * round-trip.
 *
 * AN EXPIRED SESSION
 * A session can end while the trader is working. `setUnauthorizedHandler` lets
 * the API layer report a 401 from anywhere, and this hook drops to `signed-out`
 * in response. The alternative — letting a screen render an empty Trade Memory
 * because its request was refused — would be a lie about the trader's data.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchSession, logoutAccount, setUnauthorizedHandler } from './api.js';

/** The four states the shell can be in. */
export const SESSION_STATE = Object.freeze({
  /** Asking the server. Neither signed in nor out — genuinely unknown. */
  CHECKING: 'checking',
  SIGNED_IN: 'signed-in',
  SIGNED_OUT: 'signed-out',
  /** The server could not be reached, so the question could not be answered. */
  UNREACHABLE: 'unreachable',
});

/**
 * @returns {{
 *   state: string,
 *   user: object|null,
 *   signIn: (user: object) => void,
 *   signOut: () => Promise<void>,
 *   refresh: () => Promise<void>,
 * }}
 */
export default function useAuth() {
  const [state, setState] = useState(SESSION_STATE.CHECKING);
  const [user, setUser] = useState(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const apply = useCallback((next, nextUser) => {
    if (!alive.current) return;
    setState(next);
    setUser(nextUser ?? null);
  }, []);

  const refresh = useCallback(async () => {
    const result = await fetchSession();
    if (result.ok) {
      apply(result.authenticated ? SESSION_STATE.SIGNED_IN : SESSION_STATE.SIGNED_OUT, result.user);
    } else {
      // "Could not ask" is not "not signed in". Collapsing the two would sign a
      // trader out because their wifi dropped.
      apply(SESSION_STATE.UNREACHABLE, null);
    }
  }, [apply]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // A 401 from any protected call means the session is gone. Drop the session
  // rather than let the app keep rendering as though it were signed in.
  useEffect(() => {
    setUnauthorizedHandler(() => apply(SESSION_STATE.SIGNED_OUT, null));
    return () => setUnauthorizedHandler(null);
  }, [apply]);

  /**
   * Adopts the user a successful sign-in or registration returned.
   *
   * It takes the user from the response rather than re-checking, because the
   * response that created the session is the same response that named the user —
   * there is no window in which one is true and the other is not.
   */
  const signIn = useCallback(
    (signedInUser) => {
      apply(SESSION_STATE.SIGNED_IN, signedInUser);
    },
    [apply]
  );

  /**
   * Signs out.
   *
   * The local state is cleared whatever the server says: the trader asked to
   * leave, and leaving them looking signed in because a request failed would be
   * worse than the risk of a session that is still open server-side. The next
   * load re-checks with the server and will find it gone.
   */
  const signOut = useCallback(async () => {
    apply(SESSION_STATE.SIGNED_OUT, null);
    await logoutAccount();
  }, [apply]);

  return { state, user, signIn, signOut, refresh };
}
