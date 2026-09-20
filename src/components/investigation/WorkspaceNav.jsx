/**
 * WorkspaceNav — a compact horizontal section navigator.
 *
 * Used by the navigable workspaces (Final Trade Report, Trade Review) so the
 * trader reads ONE section at a time instead of scrolling a giant document.
 *
 * It is presentation only: it owns no data and no phase logic. It reuses the
 * established investigation pill visual language (`inv-nav__item`) so the
 * selected state and the state dots look the same everywhere, rather than
 * inventing a second navigation style.
 *
 * Items may carry:
 *   - id      (required) the section id
 *   - label   (required) the short tab label
 *   - index   optional leading number (the report keeps its 1..10 numbering)
 *   - mod     optional runtime/availability modifier ('complete' | 'partial' |
 *             'unavailable' | 'loading') — draws the state dot
 *   - badge   optional trailing chip text
 *
 * The strip scrolls horizontally when it does not fit, so it stays usable at
 * narrower widths without collapsing into a second row of clutter.
 */

export default function WorkspaceNav({ title, meta, items, activeId, onSelect, ariaLabel }) {
  const list = Array.isArray(items) ? items : [];

  return (
    <nav className="ws-nav" aria-label={ariaLabel || title || 'Sections'}>
      {(title || meta) && (
        <div className="ws-nav__head">
          {title && <span className="inv-nav__title">{title}</span>}
          {meta && <span className="inv-nav__meta">{meta}</span>}
        </div>
      )}

      <ul className="ws-nav__list">
        {list.map((item) => {
          const isActive = item.id === activeId;
          const hasMod = Boolean(item.mod);
          const classes = [
            'inv-nav__item',
            hasMod ? `inv-nav__item--${item.mod}` : '',
            isActive ? 'is-active' : '',
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <li className="ws-nav__li" key={item.id}>
              <button
                type="button"
                className={classes}
                onClick={() => onSelect?.(item.id)}
                aria-current={isActive ? 'true' : undefined}
                title={item.label}
                data-ws-nav-item={item.id}
              >
                {item.index != null && <span className="inv-nav__index">{item.index}</span>}
                {hasMod && <span className="inv-nav__dot" aria-hidden="true" />}
                <span className="inv-nav__label">
                  <span className="stage__label">{item.label}</span>
                </span>
                {item.badge && <span className="ws-nav__badge">{item.badge}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
