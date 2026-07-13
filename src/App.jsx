import { useCallback, useEffect, useMemo, useState } from 'react'
import Sidebar from './components/Sidebar'
import HomePanel from './components/HomePanel'
import ChannelHeader from './components/ChannelHeader'
import MessageList from './components/MessageList'
import ThreadPanel from './components/ThreadPanel'
import SearchPanel from './components/SearchPanel'
import LoginPanel from './components/LoginPanel'
import { supabase } from './lib/supabase'
import { loadWorkspaceFromSupabase, loadChannelMessages, searchMessages, CHANNEL_PAGE_SIZE } from './lib/workspaceApi'
import './index.css'

export default function App() {
  const [session, setSession] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [accessDenied, setAccessDenied] = useState('')
  const [workspace, setWorkspace] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [view, setView] = useState('home')
  const [activeConversationId, setActiveConversationId] = useState(null)
  const [channelSearch, setChannelSearch] = useState('')
  const [globalSearch, setGlobalSearch] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [activeThreadTs, setActiveThreadTs] = useState(null)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [highlightTs, setHighlightTs] = useState(null)
  const [channelSearchResults, setChannelSearchResults] = useState(null)
  const [channelSearchLoading, setChannelSearchLoading] = useState(false)

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      setAuthReady(true)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next)
      if (event === 'SIGNED_OUT') {
        setWorkspace(null)
        setAccessDenied('')
        setError('')
      }
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const loadWorkspace = useCallback(async () => {
    setLoading(true)
    setError('')
    setAccessDenied('')
    try {
      const ws = await loadWorkspaceFromSupabase()
      setWorkspace(ws)
      setView('home')
      if (ws.conversations?.length > 0) {
        const general = ws.conversations.find(c => c.kind === 'general')
        setActiveConversationId(general?.id ?? ws.conversations[0].id)
      }
    } catch (err) {
      if (err?.code === 'FORBIDDEN') {
        setAccessDenied(err.message)
        setWorkspace(null)
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load archive')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!authReady) return
    if (!session?.access_token) {
      setWorkspace(null)
      setLoading(false)
      return
    }
    // Defer so setSession auth headers are fully applied before first RPC
    const t = setTimeout(() => {
      loadWorkspace()
    }, 0)
    return () => clearTimeout(t)
  }, [authReady, session?.access_token, loadWorkspace])

  const handleSignedIn = useCallback((nextSession) => {
    setSession(nextSession)
    setAuthReady(true)
  }, [])

  useEffect(() => {
    const q = globalSearch.trim()
    if (!q || view !== 'search') {
      setSearchResults([])
      return
    }
    let cancelled = false
    setSearchLoading(true)
    const t = setTimeout(() => {
      searchMessages(q)
        .then((rows) => { if (!cancelled) setSearchResults(rows) })
        .catch((err) => { if (!cancelled) setError(err.message) })
        .finally(() => { if (!cancelled) setSearchLoading(false) })
    }, 250)
    return () => { cancelled = true; clearTimeout(t) }
  }, [globalSearch, view])

  // Channel header search — full channel history on the server
  useEffect(() => {
    const q = channelSearch.trim()
    if (!q || !activeConversationId || view !== 'channel') {
      setChannelSearchResults(null)
      return
    }
    let cancelled = false
    setChannelSearchLoading(true)
    const t = setTimeout(() => {
      searchMessages(q, { channelId: activeConversationId })
        .then((rows) => {
          if (cancelled) return
          setChannelSearchResults(rows.map(r => ({
            type: 'message',
            ts: r.ts,
            thread_ts: r.thread_ts || undefined,
            text: r.text || '',
            displayName: r.displayName,
            avatar: r.avatar || '',
            timestamp: r.timestamp,
            channel: r.channelId,
            channelName: r.channelLabel,
            reply_count: 0,
            reactions: [],
          })))
        })
        .catch((err) => { if (!cancelled) setError(err.message) })
        .finally(() => { if (!cancelled) setChannelSearchLoading(false) })
    }, 250)
    return () => { cancelled = true; clearTimeout(t) }
  }, [channelSearch, activeConversationId, view])

  const activeConversation = useMemo(
    () => workspace?.conversations.find(c => c.id === activeConversationId) ?? null,
    [workspace, activeConversationId],
  )

  const filteredMessages = useMemo(() => {
    if (!activeConversation) return []
    if (channelSearch.trim()) return channelSearchResults || []
    return activeConversation.messages
  }, [activeConversation, channelSearch, channelSearchResults])

  const openChannel = useCallback(async (id, options = {}) => {
    const aroundTs = options.aroundTs ?? null
    setActiveConversationId(id)
    setView('channel')
    setChannelSearch('')
    setChannelSearchResults(null)
    setActiveThreadTs(options.threadTs || null)
    setHighlightTs(options.ts ? String(options.ts) : null)
    setLoadingOlder(false)

    setWorkspace(prev => {
      if (!prev) return prev
      if (aroundTs == null) {
        const conv = prev.conversations.find(c => c.id === id)
        if (conv?.messagesLoaded) return prev
      }
      return {
        ...prev,
        conversations: prev.conversations.map(c =>
          c.id === id ? { ...c, messagesLoaded: false, messages: [], hasMoreOlder: false } : c,
        ),
      }
    })

    try {
      const messages = await loadChannelMessages(id, { aroundTs })
      setWorkspace(prev => {
        if (!prev) return prev
        const conversations = prev.conversations.map(c => {
          if (c.id !== id) return c
          return {
            ...c,
            messages,
            messagesLoaded: true,
            hasMoreOlder: messages.length >= CHANNEL_PAGE_SIZE,
            messageCount: messages.length,
            dateRange: dateRangeForMessages(messages),
          }
        })
        return {
          ...prev,
          conversations,
          channelMap: new Map(conversations.flatMap(c => [[c.id, c], [c.name, c]])),
        }
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load channel')
    }
  }, [])

  const loadOlderMessages = useCallback(async () => {
    if (!activeConversationId || loadingOlder) return
    const conv = workspace?.conversations.find(c => c.id === activeConversationId)
    if (!conv?.messages?.length || !conv.hasMoreOlder) return

    const oldest = conv.messages.reduce((a, b) => (a.timestamp < b.timestamp ? a : b))
    setLoadingOlder(true)
    try {
      const older = await loadChannelMessages(activeConversationId, { beforeTs: oldest.timestamp })
      setWorkspace(prev => {
        if (!prev) return prev
        const conversations = prev.conversations.map(c => {
          if (c.id !== activeConversationId) return c
          const byTs = new Map()
          for (const m of [...older, ...c.messages]) byTs.set(m.ts, m)
          const merged = [...byTs.values()].sort((a, b) => a.timestamp - b.timestamp)
          return {
            ...c,
            messages: merged,
            hasMoreOlder: older.length >= CHANNEL_PAGE_SIZE,
            dateRange: dateRangeForMessages(merged),
          }
        })
        return {
          ...prev,
          conversations,
          channelMap: new Map(conversations.flatMap(c => [[c.id, c], [c.name, c]])),
        }
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load older messages')
    } finally {
      setLoadingOlder(false)
    }
  }, [activeConversationId, loadingOlder, workspace])

  const openSearchResult = useCallback((msg) => {
    openChannel(msg.channelId, {
      aroundTs: msg.timestamp,
      ts: msg.ts,
      threadTs: msg.thread_ts && msg.thread_ts !== msg.ts ? msg.thread_ts : null,
    })
  }, [openChannel])

  const activeThreadParent = useMemo(() => {
    if (!activeThreadTs || !activeConversation) return null
    return activeConversation.messages.find(m => m.ts === activeThreadTs) ?? null
  }, [activeThreadTs, activeConversation])

  const signOut = async () => {
    await supabase.auth.signOut()
    setWorkspace(null)
    setAccessDenied('')
  }

  if (!authReady) {
    return <div className="boot">Checking session…</div>
  }

  if (!session) {
    return <LoginPanel onSignedIn={handleSignedIn} />
  }

  if (accessDenied) {
    return (
      <div className="login-shell">
        <div className="login-card">
          <h1>Access denied</h1>
          <p className="login-copy">{accessDenied}</p>
          <p className="login-copy">Signed in as {session.user.email}</p>
          <button type="button" className="login-secondary" onClick={signOut}>
            Sign out
          </button>
        </div>
      </div>
    )
  }

  if (loading && !workspace) {
    return <div className="boot">Loading archive…</div>
  }

  if (error && !workspace) {
    return (
      <div className="login-shell">
        <div className="login-card">
          <h1>Couldn’t load archive</h1>
          <p className="login-error">{error}</p>
          <button type="button" className="login-secondary" onClick={signOut}>Sign out</button>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <Sidebar
        workspace={workspace}
        activeId={activeConversationId}
        view={view}
        onSelectConversation={openChannel}
        onSelectView={setView}
        userEmail={session.user.email}
        onSignOut={signOut}
      />

      <main className="main">
        <div className="top-search-bar">
          <input
            type="search"
            className="top-search-input"
            placeholder="Search all messages…"
            value={globalSearch}
            onChange={(e) => {
              setGlobalSearch(e.target.value)
              setView('search')
            }}
            onFocus={() => setView('search')}
          />
          <button type="button" className="top-signout-btn" onClick={signOut}>
            Sign out
          </button>
        </div>

        {view === 'home' && (
          <HomePanel workspace={workspace} onOpenChannel={openChannel} />
        )}

        {view === 'search' && (
          <SearchPanel
            results={searchResults}
            query={globalSearch}
            userMap={workspace.userMap}
            onOpenMessage={openSearchResult}
            loading={searchLoading}
          />
        )}

        {view === 'channel' && activeConversation && (
          <div className={`channel-layout ${activeThreadTs ? 'channel-layout-thread-open' : ''}`}>
            <div className="channel-column">
              <ChannelHeader
                conversation={activeConversation}
                search={channelSearch}
                onSearchChange={setChannelSearch}
              />
              {!activeConversation.messagesLoaded && !channelSearch.trim() ? (
                <div className="boot">Loading messages…</div>
              ) : channelSearch.trim() && channelSearchLoading ? (
                <div className="boot">Searching channel…</div>
              ) : (
                <MessageList
                  messages={filteredMessages}
                  userMap={workspace.userMap}
                  activeThreadTs={activeThreadTs}
                  onOpenThread={setActiveThreadTs}
                  hasMoreOlder={!channelSearch.trim() && !!activeConversation.hasMoreOlder}
                  loadingOlder={loadingOlder}
                  onLoadOlder={loadOlderMessages}
                  scrollToBottomToken={`${activeConversation.id}-${activeConversation.messagesLoaded}`}
                  highlightTs={highlightTs}
                />
              )}
            </div>
            {activeThreadParent && (
              <ThreadPanel
                channelName={activeConversation.name}
                parent={activeThreadParent}
                messages={activeConversation.messages}
                userMap={workspace.userMap}
                onClose={() => setActiveThreadTs(null)}
              />
            )}
          </div>
        )}

        {error && <div className="toast error">{error}</div>}
      </main>
    </div>
  )
}

function dateRangeForMessages(messages) {
  if (!messages.length) return null
  const min = Math.min(...messages.map(m => m.timestamp))
  const max = Math.max(...messages.map(m => m.timestamp))
  return { from: min, to: max }
}
