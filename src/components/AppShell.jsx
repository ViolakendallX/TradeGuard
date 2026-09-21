import Sidebar from './Sidebar.jsx';
import Icon from './Icon.jsx';
import Logo from './Logo.jsx';
import { NAV_ITEMS } from '../lib/constants.js';

/**
 * The application shell.
 *
 * The whole screen inherits ONE custom property — `--section-accent` — set here
 * from the active screen's accent. Every chrome element (the header marker, the
 * title rule, the section edge, the active badge) reads from it, so a screen's
 * colour is decided in exactly one place and cannot disagree with itself.
 *
 * The account chip replaced the "Sign in" entry point when authentication became
 * real. It sits in the same place in the topbar and keeps the same shape, because
 * the shell is not what changed — only who it is reporting.
 */
export default function AppShell({
  activeId,
  onNavigate,
  apiOnline,
  title,
  subtitle,
  user,
  onSignOut,
  signingOut = false,
  children,
}) {
  const active = NAV_ITEMS.find((item) => item.id === activeId);
  const accent = active?.accent ?? 'thesis';

  return (
    <div className="app" data-accent={accent}>
      <Sidebar activeId={activeId} onNavigate={onNavigate} />

      <div className="main">
        <header className="topbar">
          {/* The wordmark lives in the topbar as well as the sidebar, but only
              where the sidebar has collapsed to its icon rail — otherwise the
              product would sign itself twice in a row. */}
          <div className="topbar__brand">
            <Logo size="sm" />
          </div>

          <div className="topbar__lead">
            <span className="topbar__marker" aria-hidden="true" />
            <div className="topbar__headings">
              <div className="topbar__title">{title}</div>
              {subtitle && <div className="topbar__subtitle">{subtitle}</div>}
            </div>
          </div>

          <div className="topbar__meta">
            <span className="pill pill--status">
              <span className={`status-dot${apiOnline ? '' : ' is-offline'}`} />
              {apiOnline ? 'API online' : 'API offline'}
            </span>
            <span className="pill">Phase 13 · Trader Review</span>

            {/* The account this Trade Memory belongs to. Showing the name here is
                not decoration: it is how the trader can tell which account is
                open, which is what makes "why is my journal empty?" answerable. */}
            {user && (
              <span className="topbar__account" data-auth-account={user.id}>
                <Icon name="lock" size={14} />
                <span className="topbar__account-name">{user.name || user.email}</span>
              </span>
            )}

            <button
              type="button"
              className="btn btn--ghost topbar__signout"
              onClick={onSignOut}
              disabled={signingOut}
              aria-busy={signingOut}
              data-auth-signout
            >
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </header>

        {/* `data-screen` is the hook the stylesheet uses to give ONE screen its
            own workspace geometry without wrapping its children — a wrapper
            would collapse the `.content > *` entry-animation stagger. */}
        <main className="content" data-screen={activeId}>
          {children}
        </main>
      </div>
    </div>
  );
}
