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
 * Load workspace metadata only (no message bodies).
 */
export async function loadWorkspaceFromSupabase() {
  const { data: allowed, error: allowErr } = await supabase
    .from('allowed_emails')
    .select('email')
    .maybeSingle()

  if (allowErr) throw new Error(allowErr.message)
  if (!allowed) {
    const err = new Error('Your email is not on the access list')
    err.code = 'FORBIDDEN'
    throw err
  }

  const [usersRes, channelsRes, statsRes] = await Promise.all([
    supabase.from('slack_users').select('id,name,real_name,display_name,email,avatar_72,is_admin,is_bot,deleted'),
    supabase.from('slack_channels').select('id,name,kind,topic,purpose,member_count,is_general'),
    supabase.rpc('archive_stats'),
  ])

  if (usersRes.error) throw new Error(usersRes.error.message)
  if (channelsRes.error) throw new Error(channelsRes.error.message)

  const statsRow = !statsRes.error && statsRes.data?.[0] ? statsRes.data[0] : null

  const users = (usersRes.data || []).map(u => ({
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

  const conversations = (channelsRes.data || []).map(ch => ({
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

  const messageCount = Number(statsRow?.message_count) || 0

  return {
    users,
    userMap,
    channelMap: new Map(conversations.flatMap(c => [[c.id, c], [c.name, c]])),
    conversations,
    canvases: [],
    dms: [],
    mpims: [],
    stats: {
      userCount: Number(statsRow?.user_count) || users.length,
      channelCount: Number(statsRow?.channel_count) || conversations.length,
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
 * Full-text search across the archive (server-side, not limited to loaded messages).
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
