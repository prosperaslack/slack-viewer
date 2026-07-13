import { supabase } from './supabase'

const CHANNEL_PAGE_SIZE = 60

function mapMessage(m) {
  return {
    type: 'message',
    ts: m.ts,
    thread_ts: m.thread_ts || undefined,
    user: m.user_id || undefined,
    text: m.text || '',
    subtype: m.subtype || undefined,
    reply_count: m.reply_count || 0,
    reactions: m.reactions || [],
    channel: m.channel_id,
    channelName: m.channel_name,
    displayName: m.display_name,
    avatar: m.avatar || '',
    timestamp: m.msg_ts,
  }
}

/**
 * Load workspace metadata via one security-definer RPC (avoids RLS timeouts).
 */
export async function loadWorkspaceFromSupabase() {
  const { data, error } = await supabase.rpc('load_workspace_bootstrap')

  if (error) {
    if (/FORBIDDEN|42501|not on the access|allowlist/i.test(error.message)) {
      const err = new Error('Your email is not on the access list')
      err.code = 'FORBIDDEN'
      throw err
    }
    throw new Error(error.message)
  }

  const payload = data || {}
  const usersRaw = payload.users || []
  const channelsRaw = payload.channels || []
  const statsRaw = payload.stats || {}

  const users = usersRaw.map(u => ({
    id: u.id,
    name: u.name,
    real_name: u.real_name,
    profile: {
      display_name: u.display_name,
      real_name: u.real_name,
      email: u.email,
      image_72: u.avatar_72,
    },
    is_admin: u.is_admin,
    is_bot: u.is_bot,
    deleted: u.deleted,
  }))

  const userMap = new Map(users.map(u => [u.id, u]))

  const conversations = channelsRaw.map(ch => ({
    id: ch.id,
    name: ch.name,
    kind: ch.kind || (ch.is_general ? 'general' : 'channel'),
    topic: ch.topic || '',
    purpose: ch.purpose || '',
    messages: [],
    messagesLoaded: false,
    messageCount: null,
    memberCount: ch.member_count || 0,
    dateRange: null,
  }))

  conversations.sort((a, b) => {
    if (a.kind === 'general') return -1
    if (b.kind === 'general') return 1
    return b.memberCount - a.memberCount || a.name.localeCompare(b.name)
  })

  const messageCount = Number(statsRaw.message_count) || 0

  return {
    users,
    userMap,
    channelMap: new Map(conversations.flatMap(c => [[c.id, c], [c.name, c]])),
    conversations,
    canvases: [],
    dms: [],
    mpims: [],
    stats: {
      userCount: Number(statsRaw.user_count) || users.length,
      channelCount: Number(statsRaw.channel_count) || conversations.length,
      messageCount,
      threadCount: 0,
      hasMessages: messageCount > 0,
      dateRange: null,
    },
  }
}

/**
 * Load only the latest 60 messages for a channel.
 * Pass aroundTs (from search) to load 60 messages around that point instead.
 */
export async function loadChannelMessages(channelId, { aroundTs } = {}) {
  const { data, error } = await supabase.rpc('get_channel_messages', {
    p_channel_id: channelId,
    p_limit: CHANNEL_PAGE_SIZE,
    p_around_ts: aroundTs ?? null,
  })

  if (error) throw new Error(error.message)
  return (data || []).map(mapMessage)
}

/**
 * Full-text search across the archive (server-side).
 */
export async function searchMessages(query) {
  const q = query.trim()
  if (!q) return []
  const { data, error } = await supabase.rpc('search_slack_messages', { q, lim: 50 })
  if (error) throw new Error(error.message)
  return (data || []).map(m => ({
    channelId: m.channel_id,
    channelLabel: m.channel_name,
    ts: m.ts,
    thread_ts: m.thread_ts,
    text: m.text,
    displayName: m.display_name,
    avatar: m.avatar,
    timestamp: m.msg_ts,
  }))
}
