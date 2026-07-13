import { formatMrkdwn, formatTimestamp } from '../lib/slackExport'

export default function SearchPanel({ results, query, onQueryChange, userMap, onOpenMessage, loading }) {
  return (
    <div className="search-panel">
      <header className="panel-header">
        <h2>Search messages</h2>
        <input
          type="search"
          className="search-input-lg"
          placeholder="Search across all channels…"
          value={query}
          onChange={e => onQueryChange(e.target.value)}
          autoFocus
        />
      </header>

      {!query.trim() ? (
        <p className="search-hint">Type to search message text and author names.</p>
      ) : loading ? (
        <p className="search-hint">Searching…</p>
      ) : results.length === 0 ? (
        <p className="search-hint">No results for “{query}”.</p>
      ) : (
        <ul className="search-results">
          {results.map(msg => (
            <li key={`${msg.channelId}-${msg.ts}`}>
              <button type="button" className="search-result" onClick={() => onOpenMessage(msg)}>
                <div className="search-result-meta">
                  <span className="search-channel">#{msg.channelLabel}</span>
                  <span>{msg.displayName}</span>
                  <time>{formatTimestamp(msg.timestamp)}</time>
                </div>
                <div
                  className="search-snippet"
                  dangerouslySetInnerHTML={{ __html: formatMrkdwn(msg.text, userMap) }}
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
