import Logo from './Logo.jsx';

/**
 * The one shape for "there is nothing here yet".
 *
 * Every empty state in TradeGuard carries the wordmark, because an empty list
 * with no brand on it reads as a broken page rather than as a product waiting
 * for its first trade. It says what is missing and — when there is one — what
 * the trader can do about it. It never invents content to fill the space.
 */
export default function EmptyState({ title, children, actions, logoSize = 'md' }) {
  return (
    <div className="empty-state" data-empty-state>
      <div className="empty-state__logo" aria-hidden="true">
        <Logo size={logoSize} />
      </div>
      {title && <div className="empty-state__title">{title}</div>}
      {children && <div className="empty-state__text">{children}</div>}
      {actions && <div className="empty-state__actions">{actions}</div>}
    </div>
  );
}
