export default function ChannelsPanel({ conversations, activeId, onSelectConversation }) {
  return (
    <div className="channels-panel">
      <header className="panel-header compact">
        <h2>Channels</h2>
      </header>
      <ul className="channels-panel-list">
        {conversations.map(conv => (
          <li key={conv.id}>
            <button
              type="button"
              className={`channels-panel-item ${activeId === conv.id ? 'active' : ''}`}
              onClick={() => onSelectConversation(conv.id)}
            >
              <span className="channel-hash">#</span>
              <span className="channel-name">{conv.name}</span>
              {conv.memberCount > 0 && (
                <span className="msg-count">{conv.memberCount}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
