/**
 * The TradeGuard icon set.
 *
 * ONE language: 24×24 grid, stroke-only, round caps and joins, a single
 * stroke width, and `currentColor` so an icon always takes the accent of
 * whatever it sits in. No emoji, no filled illustrations, no mixing weights —
 * that consistency is what makes the set read as a system rather than as
 * clip-art.
 *
 * Each icon inherits its colour from its parent, so a section's accent is
 * applied once (on the container) and everything inside — icon, edge, badge —
 * follows.
 */

const ICONS = {
  /* Trade Idea — the starting point */
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M15.3 8.7 L13.4 13.4 L8.7 15.3 L10.6 10.6 Z" />
    </>
  ),

  /* Thesis — the idea under the microscope */
  thesis: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),

  /* Market — live price action */
  market: (
    <>
      <path d="M3.5 20.5 H20.5" />
      <path d="M4 20.5 V3.5" />
      <path d="M7 16.5 L11 11 L14.6 13.8 L20 6.8" />
      <circle cx="20" cy="6.8" r="1.5" fill="currentColor" stroke="none" />
    </>
  ),

  /* Events — catalysts on a calendar */
  events: (
    <>
      <rect x="3.2" y="5" width="17.6" height="15.8" rx="2.4" />
      <path d="M8 3 V6.6 M16 3 V6.6 M3.2 10.4 H20.8" />
      <circle cx="12" cy="15" r="1.6" fill="currentColor" stroke="none" />
    </>
  ),

  /* Thesis attack — the guard that argues back */
  attack: (
    <>
      <path d="M12 2.8 L20.4 6 V11.6 C20.4 16.6 17 20.4 12 21.8 C7 20.4 3.6 16.6 3.6 11.6 V6 Z" />
      <path d="M12 8.4 V13.4" />
      <circle cx="12" cy="16.4" r="1" fill="currentColor" stroke="none" />
    </>
  ),

  /* History — what actually happened before */
  history: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 7.2 V12 L15.4 13.9" />
    </>
  ),

  /* Risk — capital exposure, metered */
  risk: (
    <>
      <path d="M12 2.8 L20.4 6 V11.6 C20.4 16.6 17 20.4 12 21.8 C7 20.4 3.6 16.6 3.6 11.6 V6 Z" />
      <path d="M8.2 12.6 H15.8" />
      <path d="M8.2 16 H13.2" />
    </>
  ),

  /* Structure — the trade assembled in layers */
  structure: (
    <>
      <path d="M12 3.4 L20.6 7.8 L12 12.2 L3.4 7.8 Z" />
      <path d="M3.4 12 L12 16.4 L20.6 12" />
      <path d="M3.4 16.2 L12 20.6 L20.6 16.2" />
    </>
  ),

  /* Report — the synthesised intelligence */
  report: (
    <>
      <path d="M5.4 3.2 H14.2 L18.6 7.6 V20.8 H5.4 Z" />
      <path d="M14.2 3.2 V7.6 H18.6" />
      <path d="M8.4 12.2 H15.6 M8.4 15.6 H15.6 M8.4 18.4 H12.8" />
    </>
  ),

  /* Decision — the human call */
  decision: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M8.4 12.2 L11.2 15 L15.8 9.6" />
    </>
  ),

  /* Execution — the order leaving the building */
  execution: (
    <>
      <path d="M13.4 2.6 L5.8 13.4 H11 L9.6 21.4 L18.2 9.8 H12.6 Z" />
    </>
  ),

  /* Memory — the archive of what you recorded */
  memory: (
    <>
      <rect x="3.2" y="4" width="17.6" height="5" rx="1.6" />
      <path d="M4.8 9 V19.4 C4.8 20 5.3 20.5 6 20.5 H18 C18.7 20.5 19.2 20 19.2 19.4 V9" />
      <path d="M9.6 13.4 H14.4" />
    </>
  ),

  /* Trader Review — reflection */
  review: (
    <>
      <path d="M12 3.2 L13.7 8.9 L19.4 10.6 L13.7 12.3 L12 18 L10.3 12.3 L4.6 10.6 L10.3 8.9 Z" />
      <circle cx="18.6" cy="17.4" r="1.5" />
    </>
  ),

  /* --- utility --- */
  arrow: <path d="M4.5 12 H19 M14.5 7 L19.5 12 L14.5 17" />,
  /* An account: the head and shoulders of whoever is signed in. */
  user: (
    <>
      <circle cx="12" cy="8.2" r="3.6" />
      <path d="M4.8 20.4 C4.8 16.4 8 14.2 12 14.2 C16 14.2 19.2 16.4 19.2 20.4" />
    </>
  ),
  /* An email address. */
  mail: (
    <>
      <rect x="3.2" y="5.4" width="17.6" height="13.2" rx="2.4" />
      <path d="M4.2 7.4 L12 13 L19.8 7.4" />
    </>
  ),
  check: <path d="M5 12.6 L9.6 17 L19 6.6" />,
  alert: (
    <>
      <path d="M12 3.6 L21 19.4 H3 Z" />
      <path d="M12 9.4 V13.8" />
      <circle cx="12" cy="16.6" r="0.95" fill="currentColor" stroke="none" />
    </>
  ),
  lock: (
    <>
      <rect x="4.6" y="10.4" width="14.8" height="10.2" rx="2.2" />
      <path d="M8.2 10.4 V7.6 C8.2 5.5 9.9 3.8 12 3.8 C14.1 3.8 15.8 5.5 15.8 7.6 V10.4" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 11.2 V16.4" />
      <circle cx="12" cy="8.2" r="0.95" fill="currentColor" stroke="none" />
    </>
  ),
  gap: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M8.4 12 H15.6" strokeDasharray="2.4 2.4" />
    </>
  ),
};

export default function Icon({ name, size = 18, className = '', strokeWidth = 1.75 }) {
  const glyph = ICONS[name];
  if (!glyph) return null;

  return (
    <svg
      className={`icon ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      data-icon={name}
    >
      {glyph}
    </svg>
  );
}

export const ICON_NAMES = Object.keys(ICONS);
