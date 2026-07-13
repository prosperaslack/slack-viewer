import { useCallback, useEffect, useMemo, useState } from 'react'
import Sidebar from './components/Sidebar'
import HomePanel from './components/HomePanel'
import ChannelHeader from './components/ChannelHeader'
import MessageList from './components/MessageList'
import ThreadPanel from './components/ThreadPanel'
import SearchPanel from './components/SearchPanel'
import LoginPanel from './components/LoginPanel'
import { supabase } from './lib/supabase'
import { loadWorkspaceFromSupabase, loadChannelMessages, searchMessages } from './lib/workspaceApi'
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
  const [sidebarQuery, setSidebarQuery] = useState('')
  const [channelSearch, setChannelSearch] = useState('')
  const [globalSearch, setGlobalSearch] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [activeThreadTs, setActiveThreadTs] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const loadWorkspace = useCallback(async () => {
    setLoading(true)
    setError('')
    setAccessDenied('')
    try {
      const ws = await loadWorkspaceFromSupabase()
      setWorkspace(ws)
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
    loadWorkspace()
  }, [authReady, session?.access_token, loadWorkspace])

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

  const activeConversation = useMemo(
    () => workspace?.conversations.find(c => c.id === activeConversationId) ?? null,
    [workspace, activeConversationId],
  )

  const filteredMessages = useMemo(() => {
    if (!activeConversation) return []
    const q = channelSearch.trim().toLowerCase()
    if (!q) return activeConversation.messages
    return activeConversation.messages.filter(m =>
      (m.text || '').toLowerCase().includes(q)
      || (m.displayName || '').toLowerCase().includes(q),
    )
  }, [activeConversation, channelSearch])

  const openChannel = useCallback(async (id, options = {}) => {
    const aroundTs = options.aroundTs ?? null
    setActiveConversationId(id)
    setView('channel')
    setChannelSearch('')
    setActiveThreadTs(options.threadTs || null)

    setWorkspace(prev => {
      if (!prev) return prev
      // Force reload when jumping from search (aroundTs) or first open
      if (aroundTs == null) {
        const conv = prev.conversations.find(c => c.id === id)
        if (conv?.messagesLoaded) return prev
      }
      return {
        ...prev,
        conversations: prev.conversations.map(c =>
          c.id === id ? { ...c, messagesLoaded: false, messages: [] } : c,
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

  const openSearchResult = useCallback((msg) => {
    openChannel(msg.channelId, {
      aroundTs: msg.timestamp,
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
    return <LoginPanel />
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
        query={sidebarQuery}
        onQueryChange={setSidebarQuery}
        onSelectConversation={openChannel}
        onSelectView={setView}
        userEmail={session.user.email}
        onSignOut={signOut}
      />

      <main className="main">
        {view === 'home' && (
          <HomePanel workspace={workspace} onOpenChannel={openChannel} />
        )}

        {view === 'search' && (
          <SearchPanel
            results={searchResults}
            query={globalSearch}
            onQueryChange={setGlobalSearch}
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
              {!activeConversation.messagesLoaded ? (
                <div className="boot">Loading messages…</div>
              ) : (
                <MessageList
                  messages={filteredMessages}
                  userMap={workspace.userMap}
                  activeThreadTs={activeThreadTs}
                  onOpenThread={setActiveThreadTs}
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
