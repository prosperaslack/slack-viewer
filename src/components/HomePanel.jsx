import { formatDateRange } from '../lib/slackExport'

export default function HomePanel({ workspace, onOpenChannel }) {
  const { stats, conversations } = workspace

  return (
    <div className="home-panel">
      <header className="home-hero">
        <p className="eyebrow">Read-only archive</p>
        <h1>Prospera</h1>
        <p className="subtitle">
          {stats.dateRange ? formatDateRange(stats.dateRange) : 'No message history yet'}
        </p>
      </header>

      <div className="stat-grid">
        <StatCard label="Messages" value={stats.messageCount.toLocaleString()} />
        <StatCard label="Threads" value={stats.threadCount.toLocaleString()} />
        <StatCard label="Members" value={stats.userCount.toLocaleString()} />
        <StatCard label="Channels" value={stats.channelCount.toLocaleString()} />
      </div>

      <section className="channel-directory">
        <h2>Channels</h2>
        <ul className="channel-cards">
          {conversations.map(conv => (
            <li key={conv.id}>
              <button type="button" className="channel-card" onClick={() => onOpenChannel(conv.id)}>
                <div className="channel-card-top">
                  <span className="channel-card-name">#{conv.name}</span>
                  <span className="channel-card-members">{conv.memberCount.toLocaleString()} members</span>
                </div>
                {(conv.topic || conv.purpose) && (
                  <p className="channel-card-topic">{conv.topic || conv.purpose}</p>
                )}
                <div className="channel-card-meta">
                  <span>
                    {conv.messageCount == null
                      ? `${conv.memberCount.toLocaleString()} members`
                      : `${conv.messageCount.toLocaleString()} recent`}
                  </span>
                  <span>{conv.dateRange ? formatDateRange(conv.dateRange) : '—'}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function StatCard({ label, value }) {
  return (
    <div className="stat-card">
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
    </div>
  )
}
