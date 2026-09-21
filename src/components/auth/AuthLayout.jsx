/**
 * The full-screen shell shared by Sign in and Create account.
 *
 * Left: the TradeGuard brand panel — the mark, the line, the promise, and one
 * restrained piece of trading/research visualisation. Right: a floating card
 * holding the form itself.
 *
 * The left panel carries no illustration of objects. It is an abstract chart on
 * a hairline grid, which reads as research rather than decoration and keeps the
 * page in the product's own visual language.
 */

import Logo from '../Logo.jsx';

/** The brand panel's visual: a hairline grid, a price line, one reference level. */
function AuthVisual() {
  return (
    <div className="auth__visual" aria-hidden="true">
      <svg className="auth__visual-svg" viewBox="0 0 520 190" preserveAspectRatio="none" role="presentation">
        <defs>
          <linearGradient id="tg-auth-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" className="auth__visual-stop-top" />
            <stop offset="100%" className="auth__visual-stop-bottom" />
          </linearGradient>
        </defs>

        {/* hairline grid */}
        <g className="auth__visual-grid">
          <line x1="0" y1="38" x2="520" y2="38" />
          <line x1="0" y1="76" x2="520" y2="76" />
          <line x1="0" y1="114" x2="520" y2="114" />
          <line x1="0" y1="152" x2="520" y2="152" />
          <line x1="86" y1="0" x2="86" y2="190" />
          <line x1="173" y1="0" x2="173" y2="190" />
          <line x1="260" y1="0" x2="260" y2="190" />
          <line x1="347" y1="0" x2="347" y2="190" />
          <line x1="434" y1="0" x2="434" y2="190" />
        </g>

        {/* the level the trader refuses to lose */}
        <line className="auth__visual-level" x1="0" y1="152" x2="520" y2="152" />

        {/* an honest price line: it advances, it pulls back, it advances */}
        <path
          className="auth__visual-area"
          d="M0 150 L52 138 L104 143 L156 112 L208 120 L260 92 L312 101 L364 74 L416 82 L468 56 L520 44 L520 190 L0 190 Z"
        />
        <path
          className="auth__visual-line"
          d="M0 150 L52 138 L104 143 L156 112 L208 120 L260 92 L312 101 L364 74 L416 82 L468 56 L520 44"
        />

        {/* the thesis being examined */}
        <circle className="auth__visual-node" cx="260" cy="92" r="4" />
        <circle className="auth__visual-node is-end" cx="520" cy="44" r="4" />
      </svg>
    </div>
  );
}

export default function AuthLayout({ screen, children }) {
  return (
    <div className="auth" data-auth-screen={screen}>
      <aside className="auth__brand">
        <div className="auth__glow" aria-hidden="true" />

        <div className="auth__brand-inner">
          <Logo size="lg" showTagline />

          <div className="auth__pitch">
            <h1 className="auth__headline">Think deeper. Trade smarter.</h1>
            <p className="auth__lede">
              Use AI to analyze, challenge and stress-test your trade thesis before you risk capital.
            </p>
          </div>

          <AuthVisual />

          <ul className="auth__points">
            <li>Challenge the thesis before the market does</li>
            <li>Stress-test it against what actually happened</li>
            <li>Define the risk — then decide for yourself</li>
          </ul>
        </div>
      </aside>

      <main className="auth__panel">
        <div className="auth__card card">{children}</div>
      </main>
    </div>
  );
}
