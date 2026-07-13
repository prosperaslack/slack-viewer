import { formatDateRange } from '../lib/slackExport'

export default function Sidebar({
  workspace,
  activeId,
  view,
  onSelectConversation,
  onSelectView,
  userEmail,
  onSignOut,
}) {
  const { conversations, stats } = workspace

  return (
    <aside className="sidebar">
      <div className="workspace-header">
        <button type="button" className="workspace-btn" onClick={() => onSelectView('home')}>
          <span className="workspace-icon">P</span>
          <span className="workspace-title">
            <strong>Prospera</strong>
            <small>Slack archive</small>
          </span>
        </button>
      </div>

      <nav className="sidebar-nav">
        <button
          type="button"
          className={`nav-item ${view === 'home' ? 'active' : ''}`}
          onClick={() => onSelectView('home')}
        >
          <span className="nav-icon">⌂</span>
          <span>Home</span>
        </button>
      </nav>

      <div className="sidebar-section">
        <div className="section-label">
          <span>Channels</span>
          <span className="section-count">{stats.channelCount}</span>
        </div>
        <ul className="channel-list">
          {conversations.map(conv => (
            <li key={conv.id}>
              <button
                type="button"
                className={`channel-item ${activeId === conv.id && view === 'channel' ? 'active' : ''}`}
                onClick={() => onSelectConversation(conv.id)}
              >
                <span className="channel-hash">#</span>
                <span className="channel-name">{conv.name}</span>
                {conv.messages.length > 0 && (
                  <span className="msg-count">{conv.messages.length}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="sidebar-footer">
        <p className="footer-meta">
          {stats.messageCount} messages · {formatDateRange(stats.dateRange)}
        </p>
        {userEmail && <p className="footer-email">{userEmail}</p>}
        {onSignOut && (
          <button type="button" className="signout-btn" onClick={onSignOut}>
            Sign out
          </button>
        )}
      </div>
    </aside>
  )
}
