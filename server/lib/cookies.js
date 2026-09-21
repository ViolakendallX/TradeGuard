/**
 * Minimal cookie parsing and serialisation.
 *
 * Written here rather than pulled in as a dependency because the backend is
 * deliberately dependency-light (Express + CORS, nothing else) and the surface
 * actually needed is one cookie, parsed one way. Keeping it local also means the
 * security attributes are visible in the file that sets them, rather than three
 * packages deep.
 *
 * Parsing is defensive: a malformed header yields no cookies instead of throwing,
 * because a bad `Cookie` header is a client problem and must not become a 500.
 */

/**
 * Parses a `Cookie` header into a plain object.
 * Later duplicates win, which matches what browsers send when a cookie is
 * re-set with a narrower path.
 *
 * @param {string|undefined} header
 * @returns {Record<string, string>}
 */
export function parseCookies(header) {
  const out = Object.create(null);
  if (typeof header !== 'string' || !header.trim()) return out;

  for (const pair of header.split(';')) {
    const eq = pair.indexOf('=');
    if (eq === -1) continue;

    const name = pair.slice(0, eq).trim();
    if (!name) continue;

    let value = pair.slice(eq + 1).trim();
    // A quoted value is legal; the quotes are not part of it.
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }

    try {
      out[name] = decodeURIComponent(value);
    } catch {
      // A stray '%' is not a reason to reject every other cookie.
      out[name] = value;
    }
  }

  return out;
}

/**
 * Serialises one cookie.
 *
 * `sameSite: 'Lax'` is the important default: it keeps the cookie off
 * cross-site POSTs, which is what stops another origin from driving an
 * authenticated write through the trader's browser. `httpOnly` keeps it away
 * from page scripts, so a script injected into the app cannot read the session
 * token — which is exactly why the token is not in localStorage.
 *
 * @param {string} name
 * @param {string} value
 * @param {object} [options]
 * @returns {string}
 */
export function serializeCookie(name, value, options = {}) {
  const {
    maxAge,
    path = '/',
    httpOnly = true,
    secure = false,
    sameSite = 'Lax',
  } = options;

  const parts = [`${name}=${encodeURIComponent(value)}`];

  if (path) parts.push(`Path=${path}`);
  if (typeof maxAge === 'number') parts.push(`Max-Age=${Math.floor(maxAge)}`);
  if (httpOnly) parts.push('HttpOnly');
  if (secure) parts.push('Secure');
  if (sameSite) parts.push(`SameSite=${sameSite}`);

  return parts.join('; ');
}

/**
 * A cookie header that deletes the cookie.
 *
 * The attributes must match the ones it was set with or the browser treats it as
 * a different cookie and leaves the original in place — which is how a "logout"
 * quietly fails to log anyone out.
 */
export function clearCookie(name, options = {}) {
  return serializeCookie(name, '', { ...options, maxAge: 0 });
}
