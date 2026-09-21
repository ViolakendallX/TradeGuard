import { useId } from 'react';

/**
 * The TradeGuard wordmark — the ONE brand asset.
 *
 * The mark is a shield (guard) carrying an ascending line (the thesis under
 * examination) drawn in the brand blue → cyan gradient. The word is set as
 * text rather than outlined, so it stays crisp at every size and inherits the
 * product's type scale.
 *
 * `useId` matters: the gradient needs an id, and this logo renders more than
 * once on a page (sidebar, header, auth card, empty states). A fixed id would
 * be duplicated in the DOM and the second instance would silently lose its
 * fill.
 *
 * The compact mark is exported separately for the places where there is
 * genuinely no room for the word — the auth card's small lockup and tight
 * mobile headers — but the full wordmark is the primary identity everywhere
 * else.
 */

export function LogoMark({ size = 28, className = '' }) {
  const id = useId();
  const gradient = `tg-mark-${id}`;

  return (
    <svg
      className={`logo__mark ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label="TradeGuard"
      data-logo-mark="true"
    >
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#4c8dff" />
          <stop offset="52%" stopColor="#19d9ff" />
          <stop offset="100%" stopColor="#19e6b5" />
        </linearGradient>
        {/* A soft bloom behind the mark, so the identity reads as lit rather
            than pasted on. Kept inside the SVG so it scales with the logo. */}
        <radialGradient id={`${gradient}-glow`} cx="50%" cy="42%" r="62%">
          <stop offset="0%" stopColor="#19d9ff" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#19d9ff" stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle cx="16" cy="15" r="15" fill={`url(#${gradient}-glow)`} />

      {/* the guard */}
      <path
        d="M16 2.6 L27.2 6.8 V16 C27.2 22.7 22.6 27.9 16 30.4 C9.4 27.9 4.8 22.7 4.8 16 V6.8 Z"
        fill={`url(#${gradient})`}
        fillOpacity="0.15"
        stroke={`url(#${gradient})`}
        strokeWidth="1.7"
        strokeLinejoin="round"
      />

      {/* the thesis being examined: it advances, pulls back, advances */}
      <path
        d="M9.4 20.2 L13.6 15.4 L17 18.1 L22.6 11.4"
        fill="none"
        stroke={`url(#${gradient})`}
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="22.6" cy="11.4" r="2" fill={`url(#${gradient})`} />
    </svg>
  );
}

export default function Logo({
  size = 'md',
  markSize,
  showTagline = false,
  className = '',
  compact = false,
}) {
  const dimensions = { sm: 22, md: 28, lg: 34 };
  const mark = markSize ?? dimensions[size] ?? dimensions.md;

  return (
    <div className={`logo logo--${size} ${className}`.trim()} data-logo="true">
      <LogoMark size={mark} />
      {!compact && (
        <span className="logo__text">
          <span className="logo__word">
            Trade<span className="logo__word-accent">Guard</span>
          </span>
          {showTagline && <span className="logo__tag">Trading decision desk</span>}
        </span>
      )}
    </div>
  );
}
