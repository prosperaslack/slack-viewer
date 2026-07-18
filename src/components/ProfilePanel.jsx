import { formatDateRange } from '../lib/slackExport'

export default function ProfilePanel({ workspace, userEmail, onSignOut }) {
  const { stats } = workspace

  return (
    <div className="profile-panel">
      <header className="panel-header compact">
        <h2>Profile</h2>
      </header>

      <div className="profile-card">
        <div className="profile-avatar" aria-hidden="true">P</div>
        <div className="profile-meta">
          <strong>Prospera</strong>
          <p>{userEmail || 'Signed in'}</p>
        </div>
      </div>

      <dl className="profile-stats">
        <div>
          <dt>Messages</dt>
          <dd>{stats.messageCount.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Channels</dt>
          <dd>{stats.channelCount.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Members</dt>
          <dd>{stats.userCount.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Range</dt>
          <dd>{stats.dateRange ? formatDateRange(stats.dateRange) : '—'}</dd>
        </div>
      </dl>

      {onSignOut && (
        <button type="button" className="profile-signout" onClick={onSignOut}>
          Sign out
        </button>
      )}
    </div>
  )
}
