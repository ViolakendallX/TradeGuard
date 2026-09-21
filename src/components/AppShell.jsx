import Sidebar from './Sidebar.jsx';

export default function AppShell({ activeId, onNavigate, apiOnline, title, subtitle, children }) {
  return (
    <div className="app">
      <Sidebar activeId={activeId} onNavigate={onNavigate} apiOnline={apiOnline} />

      <div className="main">
        <header className="topbar">
          <div>
            <div className="topbar__title">{title}</div>
            {subtitle && <div className="topbar__subtitle">{subtitle}</div>}
          </div>
          <div className="topbar__meta">
            <span className="pill">
              <span className={`status-dot${apiOnline ? '' : ' is-offline'}`} />
              {apiOnline ? 'API online' : 'API offline'}
            </span>
            <span className="pill">Phase 13 · Trader Review</span>
          </div>
        </header>

        <main className="content">{children}</main>
      </div>
    </div>
  );
}
