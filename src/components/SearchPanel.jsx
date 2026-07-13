import { formatMrkdwn, formatTimestamp } from '../lib/slackExport'

export default function SearchPanel({ results, query, userMap, onOpenMessage, loading }) {
  return (
    <div className="search-panel">
      {!query.trim() ? (
        <p className="search-hint">Type above to search message text and author names across all channels.</p>
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
